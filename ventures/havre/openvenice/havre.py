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

if FAILED:
    sys.exit("havre.py: upstream no longer matches:\n  " + "\n  ".join(FAILED))
print("havre.py: applied")
