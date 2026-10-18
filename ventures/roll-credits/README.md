# Roll Credits

Type a title and the names of the people who made something, pick a style, and download a 15-second scrolling end-credits video. It runs entirely in the page.

Live: https://roll-credits.yolopreneur.lol/

## Who it is for

A team lead or friend-group organizer who wants to thank the people behind a launch, a trip, a bake-off, or a last day at a job, and wants it to feel like a film ending.

## How to use it

1. Type a title, then one person per line as `Name, role` (for example `Priya, lead designer`). A line starting with `#` is a heading; a line with no comma shows the name alone.
2. Pick a style (1980s arcade, adventure epic, sitcom) and a speed. The canvas preview scrolls live and shows the roll length.
3. Click **Download WebM** or **Download GIF**.

The page loads with a sample (its own pitch) typed in the same box you use.

## What it does

- Draws the credits on a canvas with style-matched borders and type. No music.
- WebM: recorded in real time from a canvas with MediaRecorder, 640×360, 15 seconds.
- GIF: rendered frame by frame in the page, 320×180, 10 frames a second, 15 seconds, fixed 256-color palette, looping.
- Nothing is uploaded and there is no account. Once loaded, the page fetches nothing else.

## Honest limits

- Exports are 15 seconds at the chosen speed; a longer roll is cut off.
- GIF colors are coarse (fixed palette). WebM needs a browser whose MediaRecorder supports WebM and a visible tab.
- No sound, logos, custom colors or fonts; three styles only.
- Nothing is saved between visits.

## Files

`index.html`, `style.css`, `app.js`. No dependencies, no build step.

Saved rosters, co-editing, HD and longer exports, and branded templates are only an early-access list (a public issue on Teahub); none of it exists in this code.
