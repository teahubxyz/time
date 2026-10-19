# Havre's openvenice

/open is Havre's fork of [openvenice](https://github.com/nikshepsvn/openvenice) (MIT, by nikshepsvn):
upstream at one pinned commit (`OV_REF` in `tools/open.sh`) plus Havre's changes, made by `havre.py`.
`tools/open.sh` clones upstream, runs `havre.py` in it and builds the result into `open/` on every build.
`havre.py` is a list of exact edits: each names the upstream text it replaces and stops the build if that text
has changed, so a newer upstream shows exactly which change needs redoing.

## What it changes

- **Generate works on every tab.** What each model takes now comes from its spec in Venice's model list
  instead of fixed lists of old model ids:
  - Image: steps reset when the model changes, stay within its maximum, and are sent only to models that take them.
  - Audio: voices, formats and speed come from the model (e.g. Chatterbox only makes wav, with its own voices).
  - Music: durations come from the model (ACE-Step only takes 60–210s in steps of 30), as do lyrics,
    instrumental and voice. Music and video results are fetched with the model and queue_id Venice asks for,
    including a finished file sent back directly or left at a private download link.
  - Video: only models that take a prompt or one image are listed (not extend or video-to-video). A model
    with only one of the two modes uses that one.
  - Edit tools: the edit models come from Venice's list.
  - Workflows: the same fixes, and current default models.
  - Models stay in Venice's own order, so each tab starts on Venice's default rather than the alphabetically first.
- **Temporary chat**: a toggle above the chat; those chats are never saved to history.
- **Light and dark**, with Havre's look: Times and Courier, square corners, Havre's blue. The choice is
  `havre.theme` in localStorage, shared with Havre's own page ("light", "dark", or absent to follow the system).
- **Phones**: a labeled "New chat" button, and no ⌘ shortcut hints.

## Changing it

    git clone https://github.com/nikshepsvn/openvenice ov && cd ov
    git checkout <OV_REF from tools/open.sh>
    python3 <havre>/openvenice/havre.py
    npm ci && npx vite --base=/open/          # try it

Then add or change the edit in `havre.py` and run `sh tools/build.sh`. To take a newer upstream, bump `OV_REF`;
if an edit no longer matches, the build names it.
