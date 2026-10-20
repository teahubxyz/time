#!/usr/bin/env python3
"""Havre's changes to openvenice, as exact edits applied to upstream at the commit pinned in tools/open.sh.

Run from the root of an openvenice checkout: python3 havre.py
Every edit names the text it replaces and fails loudly if upstream no longer matches, so a newer upstream
shows exactly which change needs redoing. See README.md for what each part is for.
"""
import re
import sys

FAILED = []


def edit(path, *pairs, regex=False):
    """Replace each old with new in path; each old must occur exactly once."""
    with open(path, encoding="utf-8") as f:
        s = f.read()
    for old, new in pairs:
        if regex:
            n = len(re.findall(old, s, flags=re.S))
            if n != 1:
                FAILED.append(f"{path}: pattern found {n}x: {old[:80]!r}")
                continue
            s = re.sub(old, new, s, count=1, flags=re.S)
        else:
            n = s.count(old)
            if n != 1:
                FAILED.append(f"{path}: text found {n}x: {old[:80]!r}")
                continue
            s = s.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)


def cut(path, start, end):
    """Remove from the text start up to (not including) the text end."""
    with open(path, encoding="utf-8") as f:
        s = f.read()
    if s.count(start) != 1 or end not in s[s.find(start):]:
        FAILED.append(f"{path}: can't cut from {start[:60]!r}")
        return
    a = s.index(start)
    b = s.index(end, a)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s[:a] + s[b:])


def append(path, text):
    with open(path, "a", encoding="utf-8") as f:
        f.write(text)


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


S = "src/"

# ---------- models: Venice's own order, so each tab starts on Venice's default, not the alphabetically first ----------
edit(S + "hooks/use-models.ts",
     ("""        .filter((m) => !m.model_spec?.offline)
        .sort((a, b) => a.id.localeCompare(b.id)),""",
      """        .filter((m) => !m.model_spec?.offline),"""),
     ("""      if (c.model_type === 'text-to-video') group.textModel = m
      else if (c.model_type === 'image-to-video') group.imageModel = m""",
      """      // reference-to-video and video-to-video models take other inputs; this page sends text or one image
      if (c.model_type === 'text-to-video') group.textModel = m
      else if (c.model_type === 'image-to-video' && !/reference/.test(m.id)) group.imageModel = m"""),
     ("""    groups.push(...map.values())""",
      """    groups.push(...[...map.values()].filter((g) => g.textModel || g.imageModel))"""))

# ---------- audio: voices, formats and speed come from the model's spec ----------
edit(S + "components/audio/audio-view.tsx",
     ("""  const model = selectedModel || models?.[0]?.id || 'tts-kokoro'
""",
      """  const model = selectedModel || models?.[0]?.id || 'tts-kokoro'
  const spec = (models?.find((m) => m.id === model)?.model_spec ?? {}) as {
    voices?: string[]; default_voice?: string; supported_formats?: string[]; default_format?: string; supports_speed?: boolean
  }
  const voices = spec.voices?.length ? spec.voices : VOICES
  const formats: string[] = spec.supported_formats?.length ? spec.supported_formats : [...FORMATS]
"""),
     ("""  const voiceOptions = VOICES.map((v) => {""",
      """  const effVoice = voices.includes(voice) ? voice : (spec.default_voice && voices.includes(spec.default_voice) ? spec.default_voice : voices[0])
  const effFormat = formats.includes(format) ? format : (spec.default_format && formats.includes(spec.default_format) ? spec.default_format : formats[0])
  const hasSpeed = spec.supports_speed !== false
  const voiceOptions = voices.map((v) => {"""),
     ("""    const meta = langMap[prefix]""", """    const meta = /^[a-z]{2}_/.test(v) ? langMap[prefix] : undefined"""),
     ("""  const formatOptions = FORMATS.map(""", """  const formatOptions = formats.map("""),
     ("""      { model, input: text.trim(), voice, speed, response_format: format as typeof FORMATS[number] },""",
      """      { model, input: text.trim(), voice: effVoice, ...(hasSpeed ? { speed } : {}), response_format: effFormat as typeof FORMATS[number] },"""),
     ("""<Select value={voice} onChange={setVoice}""", """<Select value={effVoice} onChange={setVoice}"""),
     ("""<Select value={format} onChange={setFormat}""", """<Select value={effFormat} onChange={setFormat}"""))

# ---------- music: what a model takes (durations, lyrics, instrumental, voice) comes from its spec ----------
P = S + "components/music/music-view.tsx"
cut(P, "// Model capabilities", "export function MusicView()")
edit(P,
     ("""export function MusicView()""",
      """// What a model takes comes from its spec in Venice's model list, so new models work without code changes
interface MusicSpec {
  supports_lyrics?: boolean; lyrics_required?: boolean; supports_force_instrumental?: boolean
  duration_options?: number[]; min_duration?: number; max_duration?: number; default_duration?: number
  voices?: string[]; default_voice?: string; min_prompt_length?: number; prompt_character_limit?: number
}

function snap(v: number, spec: MusicSpec): number {
  const opts = spec.duration_options
  if (opts?.length) return opts.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))
  return Math.min(spec.max_duration ?? v, Math.max(spec.min_duration ?? v, v))
}

export function MusicView()"""),
     ("""  const config = getConfig(model)
""", """  const spec = (models?.find((m) => m.id === model)?.model_spec ?? {}) as MusicSpec
  const config = {
    lyrics: !!spec.supports_lyrics,
    instrumental: !!spec.supports_force_instrumental,
    voice: !!spec.voices?.length,
    duration: !!(spec.duration_options?.length || spec.max_duration),
  }
  const minPrompt = spec.min_prompt_length ?? 1
"""),
     ("""  const [duration, setDuration] = useState(30)
""", """  const [durationPick, setDuration] = useState<{ model: string; v: number } | null>(null)
  const duration = snap(durationPick?.model === model ? durationPick.v : (spec.default_duration ?? spec.min_duration ?? 30), spec)
  const [voicePick, setVoice] = useState('')
  const voice = spec.voices?.includes(voicePick) ? voicePick : (spec.default_voice ?? spec.voices?.[0] ?? '')
"""),
     ("""    if (!prompt.trim()) return
    const req: MusicQueueRequest""", """    if (prompt.trim().length < minPrompt) return
    const req: MusicQueueRequest"""),
     ("""    if (config.instrumental && instrumental) req.force_instrumental = true
""", """    if (config.instrumental && instrumental) req.force_instrumental = true
    if (config.voice && voice) req.voice = voice
"""),
     ("""<input type="range" min={5} max={120} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full" />""",
      """<input type="range" min={spec.duration_options?.[0] ?? spec.min_duration ?? 5} max={spec.duration_options?.at(-1) ?? spec.max_duration ?? 120} step={spec.duration_options && spec.duration_options.length > 1 ? spec.duration_options[1] - spec.duration_options[0] : 1} value={duration} onChange={(e) => setDuration({ model, v: Number(e.target.value) })} className="w-full" />"""),
     ("""      {config.instrumental && (
        <div className="flex items-center justify-between">""", """      {config.voice && (
        <div>
          <Label>Voice</Label>
          <Select value={voice} onChange={setVoice} options={(spec.voices ?? []).map((v) => ({ value: v, label: v }))} searchable />
        </div>
      )}

      {config.instrumental && (
        <div className="flex items-center justify-between">"""),
     ("""        disabled={!prompt.trim() || !apiKey""", """        disabled={prompt.trim().length < minPrompt || (!!spec.lyrics_required && !lyrics.trim()) || !apiKey"""),
     ("""import { Label, TextArea""", """import { Select } from '../ui/select'
import { Label, TextArea"""),
     ("""          <Label>Lyrics</Label>""", """          <Label hint={spec.lyrics_required ? 'required' : 'optional'}>Lyrics</Label>"""))

# ---------- image: steps follow the model (reset on change, within its max, sent only when it has steps) ----------
edit(S + "components/image/image-view.tsx",
     ("""  const [steps, setSteps] = useState(defaultSteps)
""", """  const [stepsPick, setStepsPick] = useState<{ model: string; v: number } | null>(null)
  const steps = Math.min(stepsPick?.model === model ? stepsPick.v : defaultSteps, maxSteps)
  const setSteps = (v: number) => setStepsPick({ model, v })
  const hasSteps = !!constraints?.steps
"""),
     ("""      steps,
""", """      steps: hasSteps ? steps : undefined,
"""),
     ("""      <div>
        <Label hint={String(steps)}>Steps</Label>
        <input type="range" min={1} max={maxSteps} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full" />
      </div>
""", """      {hasSteps && (
        <div>
          <Label hint={String(steps)}>Steps</Label>
          <input type="range" min={1} max={maxSteps} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full" />
        </div>
      )}
"""))

# ---------- edit tools: the edit models come from Venice's list, not a fixed list of old ids ----------
P = S + "components/image/image-tools.tsx"
cut(P, "const EDIT_MODELS = [", "export function ImageTools()")
edit(P,
     ("""import { useAuthStore } from '../../stores/auth-store'
""", """import { useAuthStore } from '../../stores/auth-store'
import { useModels } from '../../hooks/use-models'
"""),
     ("""  const [editModel, setEditModel] = useState('qwen-edit')
""", """  const { data: editModels } = useModels('inpaint')
  const EDIT_MODELS = (editModels ?? []).map((m) => ({ value: m.id, label: m.model_spec?.name || m.id }))
  const [editPick, setEditModel] = useState('')
  const editModel = EDIT_MODELS.some((o) => o.value === editPick) ? editPick : (EDIT_MODELS[0]?.value ?? '')
"""))

# ---------- video: a model family with only one of the two modes uses that one ----------
P = S + "components/video/video-view.tsx"
edit(P, ("""  const activeModel = mode === 'image' ? group?.imageModel : group?.textModel
""", """  // a model family with only one of the two modes uses that one
  const effMode: 'text' | 'image' = mode === 'image' ? (group?.imageModel ? 'image' : 'text') : (group?.textModel ? 'text' : 'image')
  const activeModel = effMode === 'image' ? group?.imageModel : group?.textModel
"""),
     ("mode === 'image' && imageUrl", "effMode === 'image' && imageUrl"),
     ("{mode === 'image' && (", "{effMode === 'image' && ("),
     ("mode === 'text' ? 'bg-white", "effMode === 'text' ? 'bg-white"),
     ("mode === 'image' ? 'bg-white", "effMode === 'image' ? 'bg-white"))

# ---------- music and video results: ask with the model and queue_id, take the file however Venice sends it ----------
append(S + "lib/venice-client.ts", """
/**
 * Ask Venice about a queued music or video job. Venice wants the model and the queue_id; while it works it
 * answers JSON with a status, and when it's done it answers with the file itself (or, for jobs queued with a
 * private download link, COMPLETED, and the file waits at that link).
 */
export type RetrieveResult =
  | { state: 'done'; url: string }
  | { state: 'working'; status: string }
  | { state: 'failed'; error: string }

export async function veniceRetrieve(
  kind: 'audio' | 'video',
  model: string,
  queueId: string,
  opts: { downloadUrl?: string; signal?: AbortSignal } = {},
): Promise<RetrieveResult> {
  const res = await veniceFetch(`/${kind}/retrieve`, {
    method: 'POST',
    body: JSON.stringify({ model, queue_id: queueId }),
    signal: opts.signal,
  })
  const type = res.headers.get('content-type') || ''
  if (!/json/i.test(type)) return { state: 'done', url: URL.createObjectURL(await res.blob()) }
  const d = (await res.json()) as { status?: string; error?: string; audio_url?: string; video_url?: string; url?: string }
  const status = String(d.status || '').toUpperCase()
  const ready = d.audio_url || d.video_url || d.url
  if (status === 'COMPLETED') {
    if (ready) return { state: 'done', url: ready }
    if (opts.downloadUrl) {
      const f = await fetch(opts.downloadUrl, { signal: opts.signal })
      if (!f.ok) return { state: 'failed', error: `Download failed (${f.status})` }
      return { state: 'done', url: URL.createObjectURL(await f.blob()) }
    }
    return { state: 'failed', error: 'Completed, but Venice sent no file' }
  }
  if (/FAIL|ERROR|CANCEL|REJECT|EXPIRE/.test(status)) return { state: 'failed', error: d.error || `Generation ${status.toLowerCase()}` }
  return { state: 'working', status: status.toLowerCase() || 'processing' }
}
""")

for kind, hook, set_url, resp in (("video", "use-video", "setVideoUrl", "VideoRetrieveResponse"),
                                  ("audio", "use-music", "setAudioUrl", "MusicRetrieveResponse")):
    P = S + "hooks/" + hook + ".ts"
    cut(P, f"        const result = await venice<{resp}>('/{kind}/retrieve'", "      } catch (err) {")
    edit(P,
         ("      } catch (err) {", f"""        const r = await veniceRetrieve('{kind}', modelRef.current, requestIdRef.current || '', {{ downloadUrl: downloadRef.current }})
        if (r.state === 'done') {{
          setStatus('completed')
          {set_url}(r.url)
          stopPolling()
        }} else if (r.state === 'failed') {{
          setStatus('failed')
          setError(r.error)
          stopPolling()
        }} else {{
          setStatus(r.status === 'queued' ? 'queued' : 'processing')
        }}
      }} catch (err) {{"""),
         ("import { venice } from '../lib/venice-client'", "import { venice, veniceRetrieve } from '../lib/venice-client'"),
         ("  const requestIdRef = useRef<string | null>(null)\n",
          "  const requestIdRef = useRef<string | null>(null)\n  const modelRef = useRef('')\n  const downloadRef = useRef<string | undefined>(undefined)\n"),
         (f", {resp}", ""))
    edit(P, (r"(      requestIdRef\.current = data\.queue_id[^\n]*\n)",
             r"\1      modelRef.current = data.model\n      downloadRef.current = (data as { download_url?: string }).download_url\n"), regex=True)

P = S + "lib/workflow-engine.ts"
cut(P, "interface PollOptions<T> {", "async function executeNode(")
edit(P,
     ("async function executeNode(", """async function pollUntilDone(kind: 'audio' | 'video', model: string, queueId: string, downloadUrl: string | undefined, signal?: AbortSignal): Promise<string> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, POLL_INTERVAL_MS)
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    })
    const r = await veniceRetrieve(kind, model, queueId, { downloadUrl, signal })
    if (r.state === 'done') return r.url
    if (r.state === 'failed') throw new Error(r.error)
  }
  throw new Error(`Generation timed out after ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`)
}

async function executeNode("""),
     ("model: data.model || 'stable-audio',", "model: data.model || 'stable-audio-25',"),
     ("model: data.model || 'wan-2.1',", "model: data.model || 'wan-3-0-text-to-video',"),
     (", MusicRetrieveResponse, VideoQueueResponse, VideoRetrieveResponse }", ", VideoQueueResponse }"))
edit(P,
     (r"const url = await pollUntilDone<MusicRetrieveResponse>\(\{.*?\n      \}\)",
      "const url = await pollUntilDone('audio', queueResp.model || String(body.model), queueResp.queue_id, (queueResp as { download_url?: string }).download_url, signal)"),
     (r"const videoId = queueResp\.queue_id \|\| queueResp\.id \|\| ''\n      const url = await pollUntilDone<VideoRetrieveResponse>\(\{.*?\n      \}\)",
      "const url = await pollUntilDone('video', queueResp.model || String(body.model), queueResp.queue_id || queueResp.id || '', (queueResp as { download_url?: string }).download_url, signal)"),
     (r"import \{ venice([^}]*)\} from '\./venice-client'", r"import { venice, veniceRetrieve\1} from './venice-client'"),
     regex=True)

# ---------- temporary chat: never saved to history ----------
edit(S + "types/venice.ts", ("  model: string\n  createdAt: number\n}",
     "  model: string\n  createdAt: number\n  /** a temporary chat: kept in memory only, never saved to history */\n  temporary?: boolean\n}"))
edit(S + "stores/chat-store.ts",
     ("  isStreaming: boolean\n  veniceParams",
      "  isStreaming: boolean\n  /** new chats are temporary: not saved, gone on reload or when this is turned off */\n  temporaryMode: boolean\n  setTemporaryMode: (on: boolean) => void\n  veniceParams"),
     ("      isStreaming: false,\n      veniceParams: {",
      "      isStreaming: false,\n      temporaryMode: false,\n      setTemporaryMode: (on) =>\n        set((s) => ({\n          temporaryMode: on,\n          // either way, start fresh; turning it off throws the temporary chats away\n          conversations: on ? s.conversations : s.conversations.filter((c) => !c.temporary),\n          activeConversationId: null,\n        })),\n      veniceParams: {"),
     ("          model,\n          createdAt: Date.now(),\n        }",
      "          model,\n          createdAt: Date.now(),\n          ...(get().temporaryMode ? { temporary: true } : {}),\n        }"),
     ("        conversations: state.conversations.slice(0, 50),\n        activeConversationId: state.activeConversationId,",
      "        conversations: state.conversations.filter((c) => !c.temporary).slice(0, 50),\n        activeConversationId: state.conversations.find((c) => c.id === state.activeConversationId)?.temporary ? null : state.activeConversationId,"))
edit(S + "components/chat/chat-view.tsx",
     ("  const deleteMessage = useChatStore((s) => s.deleteMessage)\n",
      "  const deleteMessage = useChatStore((s) => s.deleteMessage)\n  const temporaryMode = useChatStore((s) => s.temporaryMode)\n  const setTemporaryMode = useChatStore((s) => s.setTemporaryMode)\n"),
     ("    <div className=\"flex flex-col h-full\">\n      <div className=\"flex-1 overflow-y-auto\">", """    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end gap-2 px-4 py-1.5 border-b border-white/[0.04]">
        {temporaryMode && <span className="text-[12px] text-white/45 mr-auto">Temporary chat: not saved to history, gone when you leave or turn it off.</span>}
        <button
          type="button"
          onClick={() => setTemporaryMode(!temporaryMode)}
          aria-pressed={temporaryMode}
          title={temporaryMode ? 'Turn off temporary chat' : 'Start a temporary chat that is not saved'}
          className={'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] border transition-colors ' + (temporaryMode ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-white/[0.10] text-white/55 hover:text-white/85')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" strokeDasharray="3 3" /><path d="M12 7v5l3 2" /></svg>
          Temporary chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">"""))

# ---------- sidebar: temporary chats stay out of history; on phones a labeled New chat and no shortcut hints ----------
P = S + "components/layout/sidebar.tsx"
edit(P,
     ("  const conversations = useChatStore((s) => s.conversations)\n",
      "  const allConversations = useChatStore((s) => s.conversations)\n  const conversations = useMemo(() => allConversations.filter((c) => !c.temporary), [allConversations])\n"),
     ("aria-label=\"New chat\"\n              className=\"", "aria-label=\"New chat\"\n              className=\"flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] border border-white/[0.12] "),
     ('title="New chat (⌘N)"', 'title="New chat"'),
     ('<div className="px-3 py-2.5 border-t border-white/[0.04]">\n          <div className="text-[11px] text-white/35 space-y-0.5">',
      '<div className="hidden md:block px-3 py-2.5 border-t border-white/[0.04]">\n          <div className="text-[11px] text-white/35 space-y-0.5">'))
edit(P, (r'(<line x1="5" y1="12" x2="19" y2="12" /></svg>)(\n\s*</button>\n\s*</div>\n\s*\{conversations\.length > 5)', r'\1<span>New chat</span>\2'), regex=True)

# ---------- light and dark, shared with Havre's page through "havre.theme" ----------
P = S + "components/layout/header.tsx"
edit(P, ("""      <div className="flex-1" />

      <button
        onClick={onOpenApiKey}""", """      <div className="flex-1" />

      <ThemeToggle />

      <button
        onClick={onOpenApiKey}"""),
     ("import { useSettingsStore } from '../../stores/settings-store'\n",
      "import { useState } from 'react'\nimport { useSettingsStore } from '../../stores/settings-store'\n"))
append(P, """
/** light or dark, shared with Havre's own page through "havre.theme" (absent: follow the system) */
function ThemeToggle() {
  const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const read = () => { try { return localStorage.getItem('havre.theme') || '' } catch { return '' } }
  const [theme, setTheme] = useState(read)
  const dark = theme ? theme === 'dark' : systemDark()
  const flip = () => {
    const next = dark ? 'light' : 'dark'
    try { localStorage.setItem('havre.theme', next) } catch { /* this visit only */ }
    document.documentElement.setAttribute('data-theme', next)
    setTheme(next)
  }
  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="px-2 py-1.5 text-[12px] font-mono text-white/65 hover:text-white border border-white/[0.08] hover:border-white/[0.2] transition-colors"
    >
      <span aria-hidden="true" className="md:hidden">◐</span>
      <span className="hidden md:inline">{dark ? 'light' : 'dark'}</span>
    </button>
  )
}
""")

write("public/theme-boot.js", """// Set light or dark before the page draws. "havre.theme" is shared with Havre's own page:
// "light", "dark", or absent to follow the system.
(function () {
  try {
    var t = localStorage.getItem("havre.theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* follow the system */ }
})();
""")

edit("index.html",
     ('<meta name="color-scheme" content="dark" />',
      '<meta name="color-scheme" content="dark light" />\n    <script src="%BASE_URL%theme-boot.js"></script>'),
     ("connect-src 'self' https://api.venice.ai blob:", "connect-src 'self' https://api.venice.ai https://private-share.venice.ai blob:"),
     ('<body class="bg-zinc-950 text-zinc-100 antialiased">', '<body class="antialiased">'))
edit("index.html",
     (r'\s*<link rel="preconnect" href="https://fonts\.googleapis\.com" />\n\s*<link rel="preconnect" href="https://fonts\.gstatic\.com" crossorigin />\n\s*<link href="https://fonts\.googleapis\.com[^\n]*\n', "\n"),
     regex=True)

# CSS: every white-on-dark rgba follows the theme's foreground, then Havre's look and the light palette
P = S + "index.css"
with open(P, encoding="utf-8") as f:
    css = f.read()
css = re.sub(r"rgba\(255, ?255, ?255, ?", "rgba(var(--fg), ", css)
LIGHT = """    --fg: 0, 0, 0;
    --color-white: #000000;
    --color-black: #ffffff;
    --color-bg-base: #ffffff;
    --color-bg-raised: #ffffff;
    --color-bg-overlay: #f2f2f2;
    --color-bg-input: #ffffff;
    --color-border-faint: rgba(0, 0, 0, 0.10);
    --color-border-soft: rgba(0, 0, 0, 0.18);
    --color-border-strong: rgba(0, 0, 0, 0.5);
    --color-text-primary: #000000;
    --color-text-secondary: rgba(0, 0, 0, 0.72);
    --color-text-tertiary: rgba(0, 0, 0, 0.55);
    --color-text-quaternary: rgba(0, 0, 0, 0.42);
    --color-accent: #0000ee;
    --color-accent-soft: rgba(0, 0, 238, 0.10);
    color-scheme: light;
"""
css += """
/* ---------- Havre ----------
   Havre's look: Times for words, Courier for labels and machinery, square corners, 1px rules, Havre's blue.
   Light or dark comes from "havre.theme" in localStorage, the key Havre's own page uses: "light", "dark",
   or absent to follow the system. theme-boot.js sets data-theme on <html> before the page draws. */
:root {
  --fg: 255, 255, 255;
  --font-sans: "Times New Roman", Times, "Liberation Serif", "Nimbus Roman", "DejaVu Serif", serif;
  --font-mono: "Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", "DejaVu Sans Mono", monospace;
  --color-bg-base: #0d0d0d;
  --color-bg-raised: #141414;
  --color-bg-overlay: #1c1c1c;
  --color-bg-input: #111111;
  --color-accent: #8cb4ff;
  --color-accent-soft: rgba(140, 180, 255, 0.16);
  color-scheme: dark;
}
:root[data-theme="light"] {
""" + LIGHT + """}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
""" + LIGHT + """  }
}
html { color-scheme: inherit; }
body { font-feature-settings: normal; font-size: 17px; }
/* square corners, like Havre; spinners stay round so they still read as spinning */
*, *::before, *::after { border-radius: 0 !important; }
.animate-spin { border-radius: 9999px !important; }
/* labels and machinery in Courier, like Havre's */
label, kbd, code, pre, .font-mono, [class*="uppercase"] { font-family: var(--font-mono); }
/* openvenice's hard-coded dark surfaces follow the theme's surfaces */
.bg-\\[\\#080808\\], .bg-\\[\\#0a0a0a\\], .bg-\\[\\#0a0a0c\\], .bg-\\[\\#0c0c10\\] { background-color: var(--color-bg-base) !important; }
.bg-\\[\\#0d0d11\\], .bg-\\[\\#0e0e0e\\], .bg-\\[\\#0e0e12\\], .bg-\\[\\#101015\\], .bg-\\[\\#111114\\], .bg-\\[\\#111\\] { background-color: var(--color-bg-raised) !important; }
.border-\\[\\#111\\] { border-color: var(--color-bg-raised) !important; }
"""
# light mode: the faint greys that read on black are too faint on white, so lift them
lifts = [(("10", "15", "20", "25"), 0.45), (("30", "35"), 0.55), (("40", "45"), 0.62), (("50", "55"), 0.68)]


def lift(prefix):
    out = []
    for ops, a in lifts:
        sels = []
        for o in ops:
            sels += [f"{prefix} .text-white\\/{o}", f"{prefix} .placeholder\\:text-white\\/{o}::placeholder"]
        out.append(", ".join(sels) + f" {{ color: rgba(0, 0, 0, {a}) !important; }}")
    return "\n".join(out)


css += "/* light mode: the faint greys that read on black are too faint on white, so lift them */\n"
css += lift(':root[data-theme="light"]') + "\n@media (prefers-color-scheme: light) {\n" + lift(':root:not([data-theme="dark"])') + "\n}\n"
with open(P, "w", encoding="utf-8") as f:
    f.write(css)

COMPOSE_TS = r"""/**
 * Cover + Track: play a still image over an audio track and record the two into one video file, in the
 * browser. No server and no ffmpeg: the image is drawn on a canvas, the audio is decoded by the Web Audio
 * API, the canvas stream and the audio stream are recorded together by MediaRecorder. Recording runs in
 * real time, so a 60-second track takes 60 seconds. The result is a blob: URL of an mp4 where the browser
 * records mp4 (Safari, newer Chrome), otherwise webm.
 */

const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of MIME_CANDIDATES) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* next */ }
  }
  return ''
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the cover image'))
    img.src = src
  })
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

export interface ComposeOptions {
  /** longest side of the video, px (the cover keeps its own aspect ratio) */
  maxSide?: number
  fps?: number
  signal?: AbortSignal
  onProgress?: (seconds: number, total: number) => void
}

export async function composeCoverTrack(imageSrc: string, audioSrc: string, opts: ComposeOptions = {}): Promise<string> {
  if (typeof MediaRecorder === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) {
    throw new Error('This browser cannot record video (no MediaRecorder)')
  }
  const mime = pickRecorderMime()
  if (!mime) throw new Error('This browser has no video format MediaRecorder can write')
  const { signal, onProgress } = opts
  const fps = opts.fps ?? 24
  const maxSide = opts.maxSide ?? 1080

  const [img, audioBuf] = await Promise.all([
    loadImage(imageSrc),
    fetch(audioSrc, { signal }).then((r) => {
      if (!r.ok) throw new Error(`Could not fetch the track (${r.status})`)
      return r.arrayBuffer()
    }),
  ])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = even(img.naturalWidth * scale)
  canvas.height = even(img.naturalHeight * scale)
  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) throw new Error('No 2d canvas')
  const draw = () => ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height)
  draw()

  const ac = new AudioContext()
  try { await ac.resume() } catch { /* runs anyway */ }
  const buffer = await ac.decodeAudioData(audioBuf)
  const total = buffer.duration
  const dest = ac.createMediaStreamDestination()
  const source = ac.createBufferSource()
  source.buffer = buffer
  source.connect(dest)

  const stream = new MediaStream([
    ...canvas.captureStream(fps).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ])
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 160_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  // keep frames flowing: captureStream only emits when the canvas changes
  const ticker = window.setInterval(draw, 1000 / Math.min(fps, 10))
  const started = performance.now()
  const progress = window.setInterval(() => onProgress?.(Math.min(total, (performance.now() - started) / 1000), total), 1000)

  const cleanup = () => {
    window.clearInterval(ticker)
    window.clearInterval(progress)
    stream.getTracks().forEach((t) => t.stop())
    void ac.close().catch(() => undefined)
  }

  return new Promise<string>((resolve, reject) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      cleanup()
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
      const blob = new Blob(chunks, { type: mime.split(';')[0] })
      if (blob.size === 0) { reject(new Error('Recording produced no data')); return }
      resolve(URL.createObjectURL(blob))
    }
    recorder.onstop = finish
    recorder.onerror = () => { cleanup(); reject(new Error('Recording failed')) }
    source.onended = () => { window.setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop() }, 250) }
    signal?.addEventListener('abort', () => {
      try { source.stop() } catch { /* already stopped */ }
      if (recorder.state !== 'inactive') recorder.stop(); else finish()
    }, { once: true })
    recorder.start(1000)
    source.start()
  })
}

export function recorderFileExtension(): string {
  return pickRecorderMime().startsWith('video/mp4') ? 'mp4' : 'webm'
}
"""

# ---------- workflows: a Cover + Track node, so a cover image and a music track come out as one video ----------
# Venice has no compositing endpoint, so the node records the still over the track in the browser (canvas +
# Web Audio + MediaRecorder; real time, mp4 where the browser can write it, else webm). The playground agent
# used to be told music and video can't be combined; now it's told to use this node.
write(S + "lib/compose.ts", COMPOSE_TS)

edit(S + "stores/workflow-store.ts",
     ("export type VeniceNodeType = 'chat' | 'imageGen' | 'tts' | 'music' | 'video' | 'textInput' | 'output'",
      "export type VeniceNodeType = 'chat' | 'imageGen' | 'tts' | 'music' | 'video' | 'compose' | 'textInput' | 'output'"),
     ("  // Text input\n  inputText?: string\n",
      "  // Text input\n  inputText?: string\n  // Compose (cover + track)\n  maxSide?: number\n"))

edit(S + "lib/workflow-schema.ts",
     ("""      { name: 'videoResolution', type: 'enum', description: 'Resolution. Empty means model default.', default: '', enumValues: VIDEO_RESOLUTION_VALUES },
    ],
  },
}""", """      { name: 'videoResolution', type: 'enum', description: 'Resolution. Empty means model default.', default: '', enumValues: VIDEO_RESOLUTION_VALUES },
    ],
  },
  compose: {
    type: 'compose',
    label: 'Cover + Track',
    description: 'Combines an upstream image and an upstream audio clip into one video file: the image stays on screen while the audio plays. Connect exactly one image node (imageGen) and one audio node (music or tts) to it. Recorded in the browser in real time (a 60s track takes 60s). No model, no prompt.',
    input: 'text',
    output: 'video',
    params: [
      { name: 'maxSide', type: 'number', description: 'Longest side of the video in pixels; the cover keeps its aspect ratio.', default: 1080, min: 256, max: 2048 },
    ],
  },
}"""))

edit(S + "lib/workflow-engine.ts",
     ("import { validateWorkflow } from './workflow-validator'\n",
      "import { validateWorkflow } from './workflow-validator'\nimport { composeCoverTrack } from './compose'\n"),
     ("""    case 'textInput':
      return data.inputText ?? ''
""", """    case 'textInput':
      return data.inputText ?? ''

    case 'compose': {
      const image = /\\[image:([^\\]]+)\\]/.exec(input)?.[1]
      const audio = /\\[audio:([^\\]]+)\\]/.exec(input)?.[1]
      if (!image || !audio) {
        const has = [image && 'an image', audio && 'audio'].filter(Boolean).join(' and ') || 'neither'
        throw new Error(`Cover + Track needs one image node and one audio node connected to it (got ${has})`)
      }
      const url = await composeCoverTrack(image, audio, { maxSide: data.maxSide ?? 1080, signal })
      return `[video:${url}]`
    }
"""))

# the playground agent: compose is a node type it may add (no model), and the old "can't combine" rule is gone
P = S + "lib/playground-agent-tools.ts"
edit(P,
     ("            enum: ['chat', 'imageGen', 'tts', 'music', 'video'],",
      "            enum: ['chat', 'imageGen', 'tts', 'music', 'video', 'compose'],"),
     ("""9. **For social-video / reel requests**: canonical shape is textInput → chat(research, web) → chat(script) → video (9:16, 1080p, 5-10s) → output. For music: add a SEPARATE branch (textInput → music → output) — DO NOT connect music nodes to video nodes; they can't compose into a single AV file from this engine. Each modality gets its own output.""",
      """9. **For social-video / reel requests**: canonical shape is textInput → chat(research, web) → chat(script) → video (9:16, 1080p, 5-10s) → output. Video models cannot take an audio track, so never connect music or tts to a video node.
9b. **To combine a picture with a sound** (a cover that shows while a track plays, a slideshow still with narration, a music video from a still): use a compose node ("Cover + Track"). Connect one imageGen node and one music (or tts) node into it, and connect it to an output. It has no model and no prompt. Shape: textInput → imageGen (cover) and textInput → music (track), both → compose → output. The output is one video file the user can preview and download."""),
     ("  if (nodeType === 'video') return c.video.includes(modelId)\n  return true // textInput / output don't have models",
      "  if (nodeType === 'video') return c.video.includes(modelId)\n  return true // textInput / output / compose don't have models"))

edit(S + "lib/playground-agent.ts",
     ("""7. Use {{input}} inside a node's prompt to place upstream text precisely, or leave prompt empty to append input after.""",
      """7. Use {{input}} inside a node's prompt to place upstream text precisely, or leave prompt empty to append input after.
7b. To show a picture while a sound plays (cover + track, still + narration), add a "compose" node with one imageGen and one music/tts node connected into it, then connect it to an output. It has no model or prompt. Video models cannot take audio, so never connect music or tts to a video node."""))

# the canvas: a palette entry, a node card without model or prompt, and videos that play in place
P = S + "components/workflows/workflows-view.tsx"
edit(P,
     ("  { type: 'video', label: 'Video Gen', Icon: PaletteVideoIcon, color: 'text-orange-400/50' },\n",
      "  { type: 'video', label: 'Video Gen', Icon: PaletteVideoIcon, color: 'text-orange-400/50' },\n  { type: 'compose', label: 'Cover + Track', Icon: PaletteComposeIcon, color: 'text-cyan-400/50' },\n"),
     ("function PaletteOutputIcon() {",
      """function PaletteComposeIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15l5-5 4 4" /><path d="M14 17v-5l4-1v5" /><circle cx="12.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="16.5" r="1.5" /></svg>
}
function PaletteOutputIcon() {"""),
     ("  video: 'wan-2.1',\n}", "  video: 'wan-2.1',\n  compose: '',\n}"))

P = S + "components/workflows/workflow-node.tsx"
edit(P,
     ("  video: 'video',\n}", "  video: 'video',\n  compose: undefined,\n}"),
     ("  video: { label: 'Video Gen', Icon: VideoIcon, color: 'border-orange-500/30', hasInput: true, hasOutput: true },\n",
      "  video: { label: 'Video Gen', Icon: VideoIcon, color: 'border-orange-500/30', hasInput: true, hasOutput: true },\n  compose: { label: 'Cover + Track', Icon: ComposeIcon, color: 'border-cyan-500/30', hasInput: true, hasOutput: true },\n"),
     ("\nfunction OutputIcon() {", """
function ComposeIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15l5-5 4 4" /><path d="M14 17v-5l4-1v5" /><circle cx="12.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="16.5" r="1.5" /></svg>
}

function OutputIcon() {"""),
     ("""        ) : data.nodeType === 'textInput' ? (
          <textarea""", """        ) : data.nodeType === 'compose' ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] text-white/40 leading-snug">Shows the connected image while the connected audio plays, recorded here in your browser into one video (takes as long as the track).</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-white/30">max side</span>
              <input
                type="number"
                min={256}
                max={2048}
                step={2}
                value={data.maxSide ?? 1080}
                onChange={(e) => updateNode({ maxSide: Number(e.target.value) || 1080 })}
                className={cn(inputCls, 'w-24')}
              />
              <span className="text-[12px] text-white/30">px</span>
            </div>
          </div>
        ) : data.nodeType === 'textInput' ? (
          <textarea"""),
     ("""                <a href={result.output.slice(7, -1)} target="_blank" rel="noreferrer" className="text-[14px] text-blue-400 underline">Open video</a>""",
      """                <video src={result.output.slice(7, -1)} controls playsInline className="nodrag w-full rounded-lg border border-white/[0.06]" onClick={(e) => e.stopPropagation()} />"""),
     ("""              <a href={result.output.slice(7, -1)} target="_blank" rel="noreferrer" className="text-[13px] text-blue-400 underline" onClick={(e) => e.stopPropagation()}>
                Open video
              </a>""",
      """              <video src={result.output.slice(7, -1)} controls playsInline className="nodrag w-full rounded border border-white/[0.06]" onClick={(e) => e.stopPropagation()} />"""))

edit(S + "components/playground/preview-node.tsx",
     ("  video: 'border-orange-500/30',\n", "  video: 'border-orange-500/30',\n  compose: 'border-cyan-500/30',\n"))

# a playground suggestion for it
edit(S + "components/playground/playground-chat.tsx",
     ("  'Write a short song with lyrics, then generate it as music',",
      "  'Write a short song with lyrics, then generate it as music',\n  'Make a cover image and a music track from one idea, then combine them into one video where the cover shows while the track plays',"))

RUN_MJS = r"""#!/usr/bin/env node
// run.mjs: an openvenice workflow, one node at a time, headless. The same graph the canvas at /open runs in a
// browser, run on a machine: a Gitea Actions runner, your laptop, a cron. Node 20+, no dependencies; ffmpeg for a
// Cover + Track node.
//
//   node run.mjs --graph graph.json --node <id> [--out out]      one node: reads its parents' outputs from out/,
//                                                                 writes out/<id>.txt (and a file for media)
//   node run.mjs --graph graph.json --all [--out out]             every node, in dependency order
//   OV_WORKFLOW=<base64 json> node run.mjs --node <id>            the graph as the exported workflow carries it
//
// Needs VENICE_API_KEY. A node's output is one string, exactly as in the browser engine: text, or [image:<file>],
// [audio:<file>], [video:<file>] for media; a node with several parents gets their outputs joined with blank lines.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const BASE = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
const KEY = process.env.VENICE_API_KEY || "";
const POLL_MS = Number(process.env.OV_POLL_MS || 3000), POLL_MAX = Number(process.env.OV_POLL_MAX || 200);

const args = process.argv.slice(2);
const flag = (name, dflt = "") => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt; };
const has = (name) => args.includes("--" + name);
const OUT = flag("out", "out");

function loadGraph() {
  const path = flag("graph");
  const raw = path ? readFileSync(path, "utf8") : process.env.OV_WORKFLOW ? Buffer.from(process.env.OV_WORKFLOW, "base64").toString("utf8") : "";
  if (!raw) fail("no graph: --graph graph.json, or OV_WORKFLOW in the environment");
  const g = JSON.parse(raw);
  const nodes = Array.isArray(g.nodes) ? g.nodes : [], edges = Array.isArray(g.edges) ? g.edges : [];
  if (!nodes.length) fail("the graph has no nodes");
  return { name: g.name || "workflow", nodes, edges };
}

function fail(msg) { console.error("run.mjs: " + msg); process.exit(1); }

async function venice(path, body, { binary = false } = {}) {
  if (!KEY) fail("VENICE_API_KEY is not set");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, { method: "POST", headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if ([408, 425, 429, 500, 502, 503, 504].includes(res.status) && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 400); } catch { /* none */ }
      throw new Error(`Venice ${res.status} on ${path}${detail ? ": " + detail : ""}`);
    }
    const type = res.headers.get("content-type") || "";
    if (binary || !/json/i.test(type)) return { binary: Buffer.from(await res.arrayBuffer()), type };
    return { json: await res.json(), type };
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** a queued music or video job, asked about until it's done; the file, however Venice sends it */
async function retrieve(kind, model, queueId, downloadUrl) {
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_MS);
    const r = await venice(`/${kind}/retrieve`, { model, queue_id: queueId });
    if (r.binary) return { bytes: r.binary, type: r.type };
    const d = r.json || {}, status = String(d.status || "").toUpperCase(), ready = d.audio_url || d.video_url || d.url;
    if (status === "COMPLETED") {
      const url = ready || downloadUrl;
      if (!url) throw new Error("completed, but Venice sent no file");
      const f = await fetch(url);
      if (!f.ok) throw new Error(`download failed (${f.status})`);
      return { bytes: Buffer.from(await f.arrayBuffer()), type: f.headers.get("content-type") || "" };
    }
    if (/FAIL|ERROR|CANCEL|REJECT|EXPIRE/.test(status)) throw new Error(d.error || `generation ${status.toLowerCase()}`);
  }
  throw new Error(`timed out after ${(POLL_MS * POLL_MAX) / 1000}s`);
}

const ext = (type, dflt) => (/mp4/.test(type) ? "mp4" : /webm/.test(type) ? "webm" : /mpeg|mp3/.test(type) ? "mp3" : /wav/.test(type) ? "wav" : /ogg|opus/.test(type) ? "ogg" : /flac/.test(type) ? "flac" : /png/.test(type) ? "png" : /jpe?g/.test(type) ? "jpg" : /webp/.test(type) ? "webp" : dflt);

function resolvePrompt(template, input) {
  if (!template) return input;
  if (template.includes("{{input}}")) return template.replace(/\{\{input\}\}/g, input);
  return input ? `${template}\n\n${input}` : template;
}

function inputsOf(node, graph) {
  return graph.edges.filter((e) => e.target === node.id).map((e) => {
    const p = join(OUT, e.source + ".txt");
    return existsSync(p) ? readFileSync(p, "utf8") : "";
  }).filter(Boolean).join("\n\n");
}

const mediaPath = (s, tag) => { const m = new RegExp(`\\[${tag}:([^\\]]+)\\]`).exec(s); return m ? m[1] : ""; };

async function runNode(node, graph) {
  const d = node.data || {}, input = inputsOf(node, graph), file = (e) => join(OUT, `${node.id}.${e}`);
  switch (d.nodeType) {
    case "textInput": return d.inputText ?? "";
    case "output": return input;
    case "step": return input;   // a runner's own step: the workflow file runs it, not this
    case "chat": {
      const r = await venice("/chat/completions", { model: d.model || "llama-3.3-70b", messages: [{ role: "user", content: resolvePrompt(d.prompt, input) }],
        temperature: d.temperature ?? 0.7, max_tokens: d.maxTokens ?? 4096, venice_parameters: { enable_web_search: d.webSearch ?? "off" } });
      return r.json?.choices?.[0]?.message?.content ?? "";
    }
    case "imageGen": {
      const body = { model: d.model || "z-image-turbo", prompt: resolvePrompt(d.prompt, input), negative_prompt: d.negativePrompt || undefined, steps: d.steps ?? 20,
        style_preset: d.style || undefined, width: d.width ?? 1024, height: d.height ?? 1024, hide_watermark: d.hideWatermark ?? true };
      if (d.aspectRatio) body.aspect_ratio = d.aspectRatio;
      const r = await venice("/image/generate", body);
      const img = r.json?.images?.[0], b64 = typeof img === "string" ? img : img?.b64_json;
      if (!b64) throw new Error("no image came back");
      const e = b64.startsWith("/9j/") ? "jpg" : b64.startsWith("UklGR") ? "webp" : "png";
      writeFileSync(file(e), Buffer.from(b64, "base64"));
      return `[image:${file(e)}]`;
    }
    case "tts": {
      const r = await venice("/audio/speech", { model: d.model || "tts-kokoro", input: resolvePrompt(d.prompt, input), voice: d.voice || "af_sky", speed: d.speed ?? 1,
        response_format: d.responseFormat || "mp3" }, { binary: true });
      const e = d.responseFormat || ext(r.type, "mp3");
      writeFileSync(file(e), r.binary);
      return `[audio:${file(e)}]`;
    }
    case "music": {
      const body = { model: d.model || "stable-audio-25", prompt: resolvePrompt(d.prompt, input), duration_seconds: d.duration ?? 30, force_instrumental: d.instrumental ?? false };
      if (d.lyrics) body.lyrics_prompt = d.lyrics;
      const q = (await venice("/audio/queue", body)).json || {};
      const { bytes, type } = await retrieve("audio", q.model || body.model, q.queue_id, q.download_url);
      const e = ext(type, "mp3");
      writeFileSync(file(e), bytes);
      return `[audio:${file(e)}]`;
    }
    case "video": {
      const body = { model: d.model || "wan-3-0-text-to-video", prompt: resolvePrompt(d.prompt, input), aspect_ratio: d.videoAspectRatio || "16:9" };
      if (d.videoDuration) body.duration = d.videoDuration;
      if (d.videoResolution) body.resolution = d.videoResolution;
      const q = (await venice("/video/queue", body)).json || {};
      const { bytes, type } = await retrieve("video", q.model || body.model, q.queue_id || q.id, q.download_url);
      const e = ext(type, "mp4");
      writeFileSync(file(e), bytes);
      return `[video:${file(e)}]`;
    }
    case "compose": {
      const image = mediaPath(input, "image"), audio = mediaPath(input, "audio");
      if (!image || !audio) throw new Error("Cover + Track needs one image node and one audio node connected to it");
      const side = Math.max(256, Math.min(2048, Number(d.maxSide) || 1080));
      const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", image, "-i", audio, "-c:v", "libx264", "-tune", "stillimage", "-preset", "medium",
        "-vf", `scale='if(gt(iw,ih),${side},-2)':'if(gt(iw,ih),-2,${side})',pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p", "-shortest", "-movflags", "+faststart", file("mp4")], { encoding: "utf8" });
      if (r.error) throw new Error("ffmpeg is not installed (a Cover + Track node needs it)");
      if (r.status !== 0) throw new Error("ffmpeg: " + (r.stderr || "").trim().slice(-400));
      return `[video:${file("mp4")}]`;
    }
    default: throw new Error(`unknown node type ${d.nodeType}`);
  }
}

/** nodes in dependency order (a cycle is an error) */
function order(graph) {
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0])), adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) { if (!indeg.has(e.source) || !indeg.has(e.target)) continue; adj.get(e.source).push(e.target); indeg.set(e.target, indeg.get(e.target) + 1); }
  const out = [];
  let frontier = graph.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (frontier.length) {
    out.push(...frontier);
    const next = [];
    for (const id of frontier) for (const c of adj.get(id)) { indeg.set(c, indeg.get(c) - 1); if (indeg.get(c) === 0) next.push(c); }
    frontier = next;
  }
  if (out.length !== graph.nodes.length) fail("the graph has a cycle");
  return out.map((id) => graph.nodes.find((n) => n.id === id));
}

async function main() {
  const graph = loadGraph();
  mkdirSync(OUT, { recursive: true });
  const which = has("all") ? order(graph) : [graph.nodes.find((n) => n.id === flag("node"))].filter(Boolean);
  if (!which.length) fail(`no such node: ${flag("node")} (nodes: ${graph.nodes.map((n) => n.id).join(", ")})`);
  for (const node of which) {
    const label = `${node.id} [${node.data?.nodeType}]`;
    process.stdout.write(`${label}… `);
    const started = Date.now();
    const result = await runNode(node, graph);
    writeFileSync(join(OUT, node.id + ".txt"), result);
    const shown = result.startsWith("[") ? result : result.replace(/\s+/g, " ").slice(0, 120) + (result.length > 120 ? "…" : "");
    console.log(`${((Date.now() - started) / 1000).toFixed(1)}s  ${shown}`);
  }
}

main().catch((e) => fail(e.message || String(e)));
"""

ACTIONS_YAML_TS = r"""// actions-yaml.ts: a workflow as a Gitea Actions workflow file, and back. Two views of one thing:
// - a workflow made here exports as a job that walks the graph, one node per step, in dependency order, on
//   https://havre.yolopreneur.lol/open/run.mjs (the browser engine's node calls, headless);
// - any Actions workflow imports as a chain of Step nodes (one per step, each keeping its own YAML), with the rest of
//   the file (on, permissions, concurrency, the job's runs-on and env) kept as the workflow's frame, so it exports back
//   as it came in, with any Venice nodes spliced in as runner steps.
// The graph also rides in the file (env.OV_WORKFLOW, base64 JSON) so positions and params come back exactly; a Step
// node re-reads its YAML from the file on import, so an edit made in the file wins over the canvas's copy.
import type { Workflow, VeniceNodeData } from '../stores/workflow-store'
import { NODE_SCHEMAS } from './workflow-schema'

export const RUNNER_URL = 'https://havre.yolopreneur.lol/open/run.mjs'
/** sha256 of run.mjs as built beside this page; the exported file checks it before running */
export const RUNNER_SHA = '__RUNNER_SHA__'
const ENV_KEY = 'OV_WORKFLOW'

const q = (s: string) => JSON.stringify(String(s))
export const slug = (s: string) => (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow').slice(0, 60)

/** the file around the steps of an imported Actions workflow: text before the steps list, text after it, and how far in the items sit */
export interface Frame { pre: string; post: string; indent: number }

/** the graph as the file carries it: name, nodes (id, data, position), edges (source, target) and the frame, if any */
export function graphOf(wf: Workflow) {
  return {
    name: wf.name,
    nodes: wf.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: wf.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    ...(wf.frame ? { frame: wf.frame } : {}),
  }
}

/** nodes in dependency order (a cycle leaves the rest off) */
function ordered(wf: Workflow): Workflow['nodes'] {
  const indeg = new Map(wf.nodes.map((n) => [n.id, 0])), adj = new Map<string, string[]>(wf.nodes.map((n) => [n.id, []]))
  for (const e of wf.edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  const out: string[] = []
  let frontier = wf.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  while (frontier.length) {
    out.push(...frontier)
    const next: string[] = []
    for (const id of frontier) for (const c of adj.get(id) ?? []) { indeg.set(c, indeg.get(c)! - 1); if (indeg.get(c) === 0) next.push(c) }
    frontier = next
  }
  return out.map((id) => wf.nodes.find((n) => n.id === id)!)
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s+/g, '')), (c) => c.charCodeAt(0)))
const indentBy = (text: string, n: number) => text.split('\n').map((l) => (l.trim() ? ' '.repeat(n) + l : l)).join('\n')

/** one Step node as YAML list-item lines, at indent 0 ("- name: ..."): its own YAML if it has one, else from its fields */
export function stepYaml(d: VeniceNodeData): string {
  if (d.stepYaml && d.stepYaml.trim()) return d.stepYaml.replace(/\s+$/, '')
  const lines: string[] = []
  if (d.label && d.label !== 'Step') lines.push(`- name: ${q(d.label)}`)
  const head = lines.length ? '  ' : '- '
  let first = !lines.length
  const key = () => { const k = first ? head : '  '; first = false; return k }
  if (d.uses) lines.push(`${key()}uses: ${d.uses}`)
  const run = (d.run ?? '').replace(/\s+$/, '')
  if (run) {
    if (run.includes('\n')) lines.push(`${key()}run: |`, ...run.split('\n').map((l) => (l ? '    ' + l : '')))
    else lines.push(`${key()}run: ${run}`)
  }
  for (const [k, v] of [['with', d.with], ['env', d.stepEnv]] as const) {
    const body = (v ?? '').replace(/\s+$/, '')
    if (body) lines.push(`${key()}${k}:`, ...body.split('\n').map((l) => (l ? '    ' + l : '')))
  }
  if (!lines.length) lines.push(`- run: ${q(d.label || 'step')}`)
  return lines.join('\n')
}

/** the text of a step item -> name, uses, run (a `|` block joined), with and env (raw lines) */
function stepFields(item: string): Partial<VeniceNodeData> {
  const lines = item.split('\n')
  const out: Partial<VeniceNodeData> = {}
  const scalar = (k: string) => {
    const m = new RegExp(`^(?:- |  )${k}:\\s*(.*?)\\s*$`, 'm').exec(item)
    if (!m) return undefined
    const v = m[1]
    return /^".*"$/.test(v) ? JSON.parse(v) : /^'.*'$/.test(v) ? v.slice(1, -1).replace(/''/g, "'") : v
  }
  const block = (k: string) => {
    const i = lines.findIndex((l) => new RegExp(`^(?:- |  )${k}:\\s*(\\|[-+]?|>[-+]?)?\\s*$`).test(l))
    if (i < 0) return undefined
    const body: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]
      if (l.trim() && !/^\s{4}/.test(l)) break
      body.push(l.slice(4))
    }
    return body.join('\n').replace(/\s+$/, '')
  }
  const name = scalar('name'); if (name) out.label = name
  const uses = scalar('uses'); if (uses) out.uses = uses
  const run = block('run') ?? scalar('run'); if (run) out.run = run
  const w = block('with'); if (w) out.with = w
  const e = block('env'); if (e) out.stepEnv = e
  return out
}

/** a hand-written Actions file as a frame and its step items; null when it has no steps list */
export function frameOf(text: string): { frame: Frame; items: string[]; name: string } | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const at = lines.findIndex((l) => /^\s+steps:\s*(#.*)?$/.test(l))
  if (at < 0) return null
  let i = at + 1
  while (i < lines.length && (!lines[i].trim() || /^\s*#/.test(lines[i]))) i++
  const m = /^(\s*)- /.exec(lines[i] ?? '')
  if (!m) return null
  const indent = m[1].length
  const items: string[][] = []
  let j = i
  for (; j < lines.length; j++) {
    const l = lines[j]
    if (l.trim() && !/^\s*#/.test(l)) {
      const ind = /^\s*/.exec(l)![0].length
      if (ind < indent) break
      if (ind === indent) { if (!l.startsWith(' '.repeat(indent) + '- ')) break; items.push([]) }
    }
    if (!items.length) continue
    items[items.length - 1].push(l.slice(indent))
  }
  const pre = lines.slice(0, i).filter((l) => !/^\s*OV_WORKFLOW:/.test(l)).join('\n')
  const post = lines.slice(j).join('\n').replace(/\s+$/, '')
  const nm = /^name:\s*(.*?)\s*$/m.exec(pre)
  const name = nm ? (/^".*"$/.test(nm[1]) ? JSON.parse(nm[1]) : nm[1].replace(/^'|'$/g, '')) : ''
  return { frame: { pre: pre.replace(/^env:\s*\n(?=\S)/m, ''), post, indent }, items: items.map((it) => it.join('\n').replace(/\s+$/, '')), name }
}

/** the runner steps a framed job needs before its first Venice node */
function runnerSteps(needsFfmpeg: boolean): string[] {
  const s = ['- uses: actions/setup-node@v4', '  with:', '    node-version: 22']
  if (needsFfmpeg) s.push('- name: ffmpeg, for Cover + Track', '  run: |', '    command -v ffmpeg >/dev/null || sudo apt-get install -y -qq ffmpeg >/dev/null || apt-get install -y -qq ffmpeg >/dev/null')
  s.push('- name: the runner', '  run: |', `    curl -fsSLo run.mjs ${q(RUNNER_URL)}`)
  if (RUNNER_SHA && !RUNNER_SHA.startsWith('__')) s.push(`    echo "${RUNNER_SHA}  run.mjs" | sha256sum -c -`)
  s.push('    mkdir -p out')
  return s
}

/** one Venice node as runner step lines at indent 0; `keyed` adds the Venice key to the step (framed jobs have none at job level) */
function nodeStep(n: Workflow['nodes'][number], keyed: boolean): string[] {
  const s = NODE_SCHEMAS[n.data.nodeType]
  const lines = [`- name: ${q(`${n.id} (${s?.label ?? n.data.nodeType})`)}`]
  if (n.data.nodeType === 'textInput') {
    lines.push('  run: |', `    printf '%s' "$INPUT" > out/${n.id}.txt && echo "${n.id} = $INPUT"`, '  env:', `    INPUT: \${{ inputs.${n.id} }}`)
  } else {
    lines.push(`  run: node run.mjs --node ${q(n.id)}`)
    if (keyed) lines.push('  env:', '    VENICE_API_KEY: ${{ secrets.VENICE_API_KEY }}')
  }
  return lines
}

export function toActionsYaml(wf: Workflow): string {
  const nodes = ordered(wf)
  const needsFfmpeg = nodes.some((n) => n.data.nodeType === 'compose')
  const outputs = nodes.filter((n) => n.data.nodeType === 'output')
  const graph = `${ENV_KEY}: ${q(b64(JSON.stringify(graphOf(wf))))}`
  if (wf.frame) {
    // the file as it came in, its steps replaced by the graph's: Step nodes as their own YAML, Venice nodes as runner steps
    let pre = wf.frame.pre.replace(/\s+$/, '')
    pre = /^env:\s*$/m.test(pre) ? pre.replace(/^env:\s*$/m, `env:\n  ${graph}`) : pre.replace(/^(jobs:\s*)$/m, `env:\n  ${graph}\n$1`)
    if (!pre.includes(ENV_KEY)) pre += `\nenv:\n  ${graph}`
    const body: string[] = []
    let runnerIn = false
    for (const n of nodes) {
      if (n.data.nodeType === 'step') { body.push(stepYaml(n.data)); continue }
      if (!runnerIn) { body.push(runnerSteps(needsFfmpeg).join('\n')); runnerIn = true }
      body.push(nodeStep(n, true).join('\n'))
    }
    if (outputs.length) body.push(['- name: outputs', '  run: |', ...outputs.map((n) => `    echo "== ${n.id} =="; cat out/${n.id}.txt; echo`)].join('\n'))
    const steps = body.map((b) => indentBy(b, wf.frame!.indent)).join('\n')
    return pre + '\n' + steps + (wf.frame.post ? '\n' + wf.frame.post : '') + '\n'
  }
  const inputs = nodes.filter((n) => n.data.nodeType === 'textInput')
  const lines: string[] = []
  lines.push(`name: ${q(wf.name)}`)
  lines.push(`# An openvenice workflow, exported from https://havre.yolopreneur.lol/open/ (Workflows → Export).`)
  lines.push(`# Import the file there to edit it on the canvas; the graph rides in env.${ENV_KEY} below.`)
  lines.push(`# Runs on the Venice API with the secret VENICE_API_KEY. Outputs land in out/ (and an artifact, where the runner keeps them).`)
  lines.push(`on:`)
  lines.push(`  workflow_dispatch:`)
  if (inputs.length) {
    lines.push(`    inputs:`)
    for (const n of inputs) {
      lines.push(`      ${n.id}:`)
      lines.push(`        description: ${q(`Input "${n.data.label || n.id}"`)}`)
      lines.push(`        required: false`)
      lines.push(`        default: ${q(n.data.inputText ?? '')}`)
    }
  }
  lines.push(`  # schedule:               # uncomment to run on a timer, e.g. every morning at 8:`)
  lines.push(`  #   - cron: "0 8 * * *"`)
  lines.push(`env:`)
  lines.push(`  ${graph}`)
  lines.push(`jobs:`)
  lines.push(`  run:`)
  lines.push(`    runs-on: ubuntu-latest`)
  lines.push(`    timeout-minutes: 60`)
  lines.push(`    env:`)
  lines.push(`      VENICE_API_KEY: \${{ secrets.VENICE_API_KEY }}`)
  lines.push(`    steps:`)
  const body: string[] = []
  const anyVenice = nodes.some((n) => n.data.nodeType !== 'step')
  if (anyVenice) body.push(runnerSteps(needsFfmpeg).join('\n'))
  for (const n of nodes) body.push(n.data.nodeType === 'step' ? stepYaml(n.data) : nodeStep(n, false).join('\n'))
  if (outputs.length) body.push(['- name: outputs', '  run: |', ...outputs.map((n) => `    echo "== ${n.id} =="; cat out/${n.id}.txt; echo`)].join('\n'))
  if (anyVenice) body.push(['- uses: actions/upload-artifact@v4', '  if: always()', '  continue-on-error: true', '  with:', `    name: ${q(slug(wf.name))}`, '    path: out/'].join('\n'))
  lines.push(indentBy(body.join('\n'), 6))
  return lines.join('\n') + '\n'
}

export type Imported = { name: string; nodes: Workflow['nodes']; edges: Workflow['edges']; frame?: Frame }

/** the graph an exported file carries (also a plain graph JSON), or any Actions file as a chain of Step nodes; null if neither */
export function fromActionsYaml(text: string): Imported | null {
  const raw = text.trim()
  let g: unknown = null
  const framed = raw.startsWith('{') ? null : frameOf(raw)
  if (raw.startsWith('{')) {
    try { g = JSON.parse(raw) } catch { return null }
  } else {
    const m = new RegExp(`^\\s*${ENV_KEY}:\\s*(?:"([^"]+)"|'([^']+)'|(\\S+))\\s*$`, 'm').exec(raw)
    if (m) { try { g = JSON.parse(unb64(m[1] ?? m[2] ?? m[3])) } catch { g = null } }
  }
  if (!g && framed) {
    // a hand-written workflow: one Step node per step, chained in the file's order
    const nodes = framed.items.map((item, i) => ({
      id: `step${i + 1}`, type: 'venice', position: { x: 280, y: 40 + i * 180 },
      data: { label: 'Step', nodeType: 'step', model: '', prompt: '', ...stepFields(item), stepYaml: item } as VeniceNodeData,
    }))
    const edges = nodes.slice(1).map((n, i) => ({ id: `e${i}-${nodes[i].id}-${n.id}`, source: nodes[i].id, target: n.id, animated: true }))
    if (!nodes.length) return null
    return { name: framed.name || 'Imported workflow', nodes, edges, frame: framed.frame }
  }
  if (!g || typeof g !== 'object') return null
  const o = g as { name?: unknown; nodes?: unknown; edges?: unknown; frame?: unknown }
  if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null
  const nodes = (o.nodes as Array<Record<string, unknown>>).filter((n) => n && typeof n.id === 'string' && n.data && typeof n.data === 'object' && typeof (n.data as { nodeType?: unknown }).nodeType === 'string' && (n.data as { nodeType: string }).nodeType in NODE_SCHEMAS)
    .map((n, i) => ({ id: n.id as string, type: 'venice', position: (n.position && typeof n.position === 'object' ? n.position : { x: 280, y: 40 + i * 200 }) as { x: number; y: number }, data: { ...(n.data as VeniceNodeData) } }))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = (o.edges as Array<Record<string, unknown>>).filter((e) => e && typeof e.source === 'string' && typeof e.target === 'string' && ids.has(e.source) && ids.has(e.target))
    .map((e, i) => ({ id: typeof e.id === 'string' ? e.id : `e${i}-${e.source}-${e.target}`, source: e.source as string, target: e.target as string, animated: true }))
  if (!nodes.length) return null
  let frame = o.frame && typeof o.frame === 'object' && typeof (o.frame as Frame).pre === 'string' ? (o.frame as Frame) : undefined
  if (framed && frame) {
    // a framed file is the other view of the same thing: its frame and its steps' YAML win over the graph's copies
    // (a file exported from a plain canvas workflow has no frame: the graph alone is the workflow)
    frame = framed.frame
    const byName = new Map<string, string>(framed.items.map((it) => [stepFields(it).label ?? '', it]))
    for (const n of nodes) {
      if (n.data.nodeType !== 'step') continue
      const it = byName.get(n.data.label) ?? (n.data.stepYaml ? framed.items.find((x) => x.split('\n')[0] === n.data.stepYaml!.split('\n')[0]) : undefined)
      if (it) Object.assign(n.data, stepFields(it), { stepYaml: it })
    }
  }
  return { name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Imported workflow', nodes, edges, ...(frame ? { frame } : {}) }
}

export function downloadText(name: string, text: string, type = 'text/yaml') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
"""

# ---------- workflows: export as a Gitea Actions workflow file, and import one back; the headless runner ----------
# The graph rides in the file (env.OV_WORKFLOW), so import reads back exactly what was exported; the steps walk the
# same graph with public/run.mjs (served at /open/run.mjs), pinned by sha256 in the exported file.
import hashlib as _hashlib
write("public/run.mjs", RUN_MJS)
write(S + "lib/actions-yaml.ts", ACTIONS_YAML_TS.replace("__RUNNER_SHA__", _hashlib.sha256(RUN_MJS.encode("utf-8")).hexdigest()))

P = S + "components/workflows/workflows-view.tsx"
edit(P,
     ("import { toast } from '../../stores/toast-store'\n",
      "import { toast } from '../../stores/toast-store'\nimport { toActionsYaml, fromActionsYaml, downloadText, slug as wfSlug } from '../../lib/actions-yaml'\n"),
     ("""          <span className="text-[14px] text-white/50 font-medium">
            {workflows.find((w) => w.id === activeWorkflowId)?.name}
          </span>
        </div>""", """          <span className="text-[14px] text-white/50 font-medium">
            {workflows.find((w) => w.id === activeWorkflowId)?.name}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            title="This workflow as a Gitea Actions workflow file: run it on the factory, on a timer, or import it back here"
            onClick={() => {
              const wf = workflows.find((w) => w.id === activeWorkflowId)
              if (!wf) return
              downloadText(wfSlug(wf.name) + '.yml', toActionsYaml(wf))
              toast.success('Exported', 'Commit it under .gitea/workflows/ or .github/workflows/ in a repo with the secret VENICE_API_KEY.')
            }}
            className="text-[13px] text-white/35 hover:text-white/70 transition-colors px-2 py-1 border border-white/[0.08]"
          >
            Export
          </button>
        </div>"""),
     ("""          <button
            onClick={() => handleCreate(newName)}
            className="text-[14px] font-medium px-4 py-2 rounded-lg bg-white text-black hover:bg-white/90 transition-colors"
          >
            New Workflow
          </button>
        </div>""", """          <button
            onClick={() => handleCreate(newName)}
            className="text-[14px] font-medium px-4 py-2 rounded-lg bg-white text-black hover:bg-white/90 transition-colors"
          >
            New Workflow
          </button>
          <label
            title="A workflow file exported from here (.yml), or a graph as JSON"
            className="text-[14px] font-medium px-4 py-2 rounded-lg border border-white/[0.12] text-white/60 hover:text-white/90 transition-colors cursor-pointer"
          >
            Import
            <input
              type="file"
              accept=".yml,.yaml,.json,text/yaml,application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                const got = fromActionsYaml(await f.text())
                if (!got) { toast.error('No workflow in that file', 'Import a .yml exported from here, or a graph as JSON.'); return }
                const id = createWorkflow(got.name)
                useWorkflowStore.getState().updateWorkflow(id, { nodes: got.nodes, edges: got.edges })
                toast.success(`Imported ${got.name}`, `${got.nodes.length} nodes`)
              }}
            />
          </label>
        </div>"""))

# ---------- step node: a literal Actions step, so any workflow file is a chain of nodes and comes back as it went ----------
# A Step node carries one step's YAML (run, uses, with, env). In the browser it does nothing (it passes upstream text
# through); on export it is itself, verbatim; a workflow imported from a hand-written file keeps that file's frame
# (on, permissions, concurrency, runs-on, job env) and exports back into it, with Venice nodes spliced in as runner steps.
edit(S + "stores/workflow-store.ts",
     ("export type VeniceNodeType = 'chat' | 'imageGen' | 'tts' | 'music' | 'video' | 'compose' | 'textInput' | 'output'",
      "export type VeniceNodeType = 'chat' | 'imageGen' | 'tts' | 'music' | 'video' | 'compose' | 'step' | 'textInput' | 'output'"),
     ("  // Compose (cover + track)\n  maxSide?: number\n",
      "  // Compose (cover + track)\n  maxSide?: number\n  // Step (an Actions step as it is): its fields, and its YAML as it came from a file\n  run?: string\n  uses?: string\n  with?: string\n  stepEnv?: string\n  stepYaml?: string\n"),
     ("  edges: Edge[]\n  createdAt: number\n}",
      "  edges: Edge[]\n  createdAt: number\n  /** an imported Actions file's text around its steps: the workflow exports back into it */\n  frame?: { pre: string; post: string; indent: number }\n}"),
     ("  updateWorkflow: (id: string, updates: Partial<Pick<Workflow, 'name' | 'nodes' | 'edges'>>) => void",
      "  updateWorkflow: (id: string, updates: Partial<Pick<Workflow, 'name' | 'nodes' | 'edges' | 'frame'>>) => void"))

edit(S + "lib/workflow-schema.ts",
     ("""  compose: {
    type: 'compose',""", """  step: {
    type: 'step',
    label: 'Step',
    description: 'A Gitea Actions step as it is (run, uses, with, env). Does nothing in the browser: it passes upstream text through. On export it is this step, verbatim, in the workflow file.',
    input: 'text',
    output: 'text',
    params: [
      { name: 'run', type: 'text', description: 'Shell to run on the runner.', default: '' },
      { name: 'uses', type: 'string', description: 'An action to use instead of run, e.g. actions/checkout@v5.', default: '' },
    ],
  },
  compose: {
    type: 'compose',"""))

edit(S + "lib/workflow-engine.ts",
     ("""    case 'output':
      return input
""", """    case 'output':
      return input

    case 'step':
      return input   // a runner's step: nothing to do in a browser
"""))

P = S + "components/workflows/workflows-view.tsx"
edit(P,
     ("  { type: 'compose', label: 'Cover + Track', Icon: PaletteComposeIcon, color: 'text-cyan-400/50' },\n",
      "  { type: 'compose', label: 'Cover + Track', Icon: PaletteComposeIcon, color: 'text-cyan-400/50' },\n  { type: 'step', label: 'Step', Icon: PaletteStepIcon, color: 'text-white/40' },\n"),
     ("function PaletteOutputIcon() {",
      """function PaletteStepIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
}
function PaletteOutputIcon() {"""),
     ("  compose: '',\n}", "  compose: '',\n  step: '',\n}"),
     ("                useWorkflowStore.getState().updateWorkflow(id, { nodes: got.nodes, edges: got.edges })",
      "                useWorkflowStore.getState().updateWorkflow(id, { nodes: got.nodes, edges: got.edges, frame: got.frame })"),
     ("                if (!got) { toast.error('No workflow in that file', 'Import a .yml exported from here, or a graph as JSON.'); return }",
      "                if (!got) { toast.error('No workflow in that file', 'Import an Actions workflow (.yml) or a graph as JSON.'); return }"),
     ("""            title="A workflow file exported from here (.yml), or a graph as JSON\"""",
      """            title="Any Gitea Actions workflow (.yml): one exported from here comes back as it was; any other becomes a chain of Step nodes. Or a graph as JSON\""""))

P = S + "components/workflows/workflow-node.tsx"
edit(P,
     ("  compose: undefined,\n}", "  compose: undefined,\n  step: undefined,\n}"),
     ("  compose: { label: 'Cover + Track', Icon: ComposeIcon, color: 'border-cyan-500/30', hasInput: true, hasOutput: true },\n",
      "  compose: { label: 'Cover + Track', Icon: ComposeIcon, color: 'border-cyan-500/30', hasInput: true, hasOutput: true },\n  step: { label: 'Step', Icon: StepIcon, color: 'border-white/20', hasInput: true, hasOutput: true },\n"),
     ("\nfunction OutputIcon() {", """
function StepIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
}

function OutputIcon() {"""),
     ("""        <span className="text-[14px] font-medium text-white/60">{config.label}</span>""",
      """        <span className="text-[14px] font-medium text-white/60">{data.nodeType === 'step' && data.label && data.label !== 'Step' ? data.label : config.label}</span>"""),
     ("""        ) : data.nodeType === 'compose' ? (""", """        ) : data.nodeType === 'step' ? (
          <div className="flex flex-col gap-1.5">
            <input
              value={data.label === 'Step' ? '' : data.label}
              onChange={(e) => updateNode({ label: e.target.value || 'Step', stepYaml: '' })}
              placeholder="name (optional)"
              className={inputCls}
            />
            <input
              value={data.uses ?? ''}
              onChange={(e) => updateNode({ uses: e.target.value, stepYaml: '' })}
              placeholder="uses: owner/action@v1 (optional)"
              className={inputCls}
            />
            <textarea
              value={data.run ?? ''}
              onChange={(e) => updateNode({ run: e.target.value, stepYaml: '' })}
              placeholder="run: shell for the runner"
              rows={3}
              className="nodrag nowheel w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-1.5 text-[13px] font-mono text-white/70 outline-none resize-none placeholder:text-white/15"
            />
            {(data.with || data.stepEnv) && (
              <pre className="nodrag nowheel text-[12px] font-mono text-white/40 whitespace-pre-wrap max-h-24 overflow-auto">{[data.with && 'with:\\n' + data.with, data.stepEnv && 'env:\\n' + data.stepEnv].filter(Boolean).join('\\n')}</pre>
            )}
            <p className="text-[12px] text-white/30 leading-snug">Runs on the factory, not here: on export this is the step as written.</p>
          </div>
        ) : data.nodeType === 'compose' ? ("""))

edit(S + "components/playground/preview-node.tsx",
     ("  compose: 'border-cyan-500/30',\n", "  compose: 'border-cyan-500/30',\n  step: 'border-white/20',\n"))

edit(S + "lib/playground-agent-tools.ts",
     ("  return true // textInput / output / compose don't have models",
      "  return true // textInput / output / compose / step don't have models"))

if FAILED:
    sys.exit("havre.py: upstream no longer matches:\n  " + "\n  ".join(FAILED))
print("havre.py: applied")
