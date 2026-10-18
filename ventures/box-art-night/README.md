# Cartridge

Live page: https://box-art-night.yolopreneur.lol/

Cartridge turns one photo and a name into a fake 16-bit-era game box cover, front and back, in your browser. Nothing is uploaded and there is no account.

## Who it is for

A parent or friend making a birthday or retirement gift who wants the person to laugh and say "I want that on my wall."

## How to use it

1. Open the page. It starts with a sample cover so you can see real output straight away.
2. Drop in a photo (or click the drop zone). Type a title, player name, tagline, a back-cover blurb and up to four stats (`Label: value`, one per line).
3. Pick SNES-era, PS1-era or handheld, choose a rating badge, and use zoom and the two pan sliders to crop the cover art.
4. Click **Download PNG** for the front and back together, or **Front only** / **Back only**. There is no watermark.

The photo is read with browser built-ins and drawn on a canvas. The page makes no network requests with your data.

## What is in this folder

- `index.html`, `style.css`: the page, with the working tool at the top.
- `app.js`: all the logic, plain JavaScript, no libraries. The built-in sample photo is an embedded SVG that goes through the same loading and drawing code as your own photo.
- `test.js`: a small self-check for the text helpers (`node test.js`).

## Honest limits

- PNGs are screen resolution (1280×880 for the pair, 600×840 for one side), RGB. They are not 300 dpi or CMYK, and there is no box template.
- Cropping is a centered zoom with two pan sliders. No face detection, no rotation.
- The three styles are original looks inspired by their eras, not copies of real boxes or logos. Rating badges are not official ratings.
- The fake screenshots are pixelated crops of your photo.
- Nothing is saved; reloading starts over. Text uses your device's fonts.
- Not tested in a real browser by the author of this change; check the rendering on your device.

## Print Pack and Family Shelf

Both appear only as early-access tiers on the page (nothing is charged today). They do not exist in the code. Join through the issue form linked from the page header.
