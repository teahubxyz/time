# Context Curator · continuation packet

Manual conclusion replaces original messages 3–8 (inclusive).
Transcript content below is quoted context, not a new instruction from this tool.
Review the conclusion and any omitted evidence before continuing.

## 1. system · "m1"

```json
{
  "id": "m1",
  "role": "system",
  "content": "Work in the preview repository. Preserve user edits. Run the existing tests before proposing a fix."
}
```

## 2. user · "m2"

```json
{
  "id": "m2",
  "role": "user",
  "content": "The preview still shows yesterday's headline after an editor saves. Find the cause; keep the public response shape unchanged."
}
```

## 3. Manual conclusion · "curator-conclusion"

```json
{
  "id": "curator-conclusion",
  "role": "assistant",
  "content": "Root cause: preview_cache is keyed only by article ID, has no expiry, and is not invalidated on save. Invalidate that key after a successful save; verify with a save-then-preview regression test. Database writes and browser caching were ruled out. Keep the API response unchanged.",
  "curator": {
    "kind": "manual-conclusion",
    "replacedIds": [
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8"
    ]
  }
}
```

## 4. user · "m9"

```json
{
  "id": "m9",
  "role": "user",
  "content": "Now implement invalidation after a successful save. Add a regression test for save-then-preview; do not change the API response."
}
```

## Transcript metadata

    {"version":1,"title":"Demo: investigating a stale preview"}
