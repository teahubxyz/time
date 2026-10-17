---
name: house-hand
description: Draw characters, mascots, icons and scenes in the House Hand style with house.py, check them against its rules, and hand back an SVG, a PNG and a version that draws itself. Use when someone asks for a drawing in the House Hand, or for illustrations that should match the drawings at househand.yolopreneur.lol.
---

# House Hand

House Hand is a drawing style written down as code. Every drawing is an SVG built from a few pieces in `house.py`:
ink outlines of one weight, round tubes for limbs, flat colours from a small palette, and hard-edged shadows. You draw
by writing a short Python script that calls the library. Then you render it, look at it, and fix what's wrong.

Everything you need is at https://househand.yolopreneur.lol/:

- `house.py`: the drawing library. Python 3.9 or later, standard library only.
- `drawon.py`: turns a finished SVG into one that draws itself, stroke by stroke.
- `rig.py`: animates a character: key poses in, one SVG that moves by itself out.
- `skill.md`: this file.

```sh
curl -O https://househand.yolopreneur.lol/house.py -O https://househand.yolopreneur.lol/drawon.py \
     -O https://househand.yolopreneur.lol/rig.py
```

## A first drawing

Save this as `draw_wave.py` next to `house.py` and run it:

```python
from house import *

W, H = 640, 800
someone = figure(320, 720, view="front", shirt=MINT, pants=SKY, shoes=YEL, hair=(PINK, "cap"),
                 arms=(None, (4.6, -2.6)), hands=("open", "wave"), ground_shadow=True, uid="someone")
fx = sparkle(540, 170, 22, YEL) + sparkle(540, 170, 9, WHITE)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       f'<rect width="{W}" height="{H}" fill="{CREAM}"/>{someone}{fx}</svg>')
open("wave.svg", "w").write(svg)
```

That is a whole character waving hello: head, beanie, sleeves with cuffs, trousers, shoes, shadows and a sparkle.
Start every drawing from `figure()` and change one thing at a time.

## The rules

### Line and colour

- One ink line everywhere: `INK` (#2B2135), `LW` = 10 px wide, round caps and round joins. A tube is an ink stroke
  `w + 2·LW` wide under a colour stroke `w` wide on the same path (`tube()`).
- Fill only with the palette: `PINK YEL ORANGE MINT SKY CREAM SKIN LAV WHITE`, or a shadow of one of them made with
  `shade(colour)`: the same hue, more saturated, a little darker. Never grey, never a colour from outside the palette.
- Shadows and effects have no outline. One hard-edged shadow shape per form, clipped to that form with a `<clipPath>`
  (give shadow shapes `class="s"` and effects `class="fx"`). On a tube, use `band()`.
- No gradients, filters, blur, raster images or thin detail strokes. Seams, veins and speed lines are filled shapes.
- Escape `&` in text as `&amp;`.

### Shapes

- Corners and tips are rounded. Straight edges bow a little (2–5%). Use as few anchor points as the shape needs.
- The head is an oblong 1.2 times taller than wide, flattened top and bottom (`head_path`). Eyes sit on the upper
  third, the mouth centred just below. In a three-quarter view both eyes stay inside the silhouette and the far eye is
  narrower. Ears are closed lobes.
- The torso is a bean: a belly circle and one arced back (`bean_path`).
- Adults are 4.5 to 5 heads tall, children and big-headed characters 3 to 3.5. Legs are about half the height.
- Limbs are single curves of constant width. Never an angular elbow or knee.
- Hands are three fingers and a thumb. The thumb is 1.15 times a finger's width, shorter, and low on the palm. Feet
  have four toes.
- Every sleeve, trouser and collar opening is an ellipse with a lip (`opening()`). Sleeves and trouser legs are 1.6 to
  1.7 times the limb (`sleeve()`). A skirt is seen from a little above, like the rest of the figure: its hem is the
  near edge, bowing down, and the legs come out from under it (`figure(skirt=...)` draws it that way).
- Detail matches size: a small thing is a silhouette plus one mark.
- No tangents. No contour grazing another, no shape sitting exactly on a horizontal line (a rim, a horizon, the edge
  of the sheet). Overlap clearly or leave a gap.
- Draw originals. Don't copy an existing character, logo or another artist's signature devices.

## The library

`figure(cx, ground, ...)` draws a whole character standing on `ground`, centred on `cx`. The arguments you will use
most:

| argument | what it does |
|---|---|
| `head_h`, `heads` | head height in px (default 110) and height in heads (default 4.7) |
| `view` | `front`, `q` and `qr` (three-quarter left and right), `side`, `sider`, `qb`, `qbr`, `back` |
| `skin`, `shirt`, `pants`, `shoes` | colours from the palette |
| `hair` | `(colour, kind)` with kind `tuft`, `cap`, `bob`, `bun`, `spikes` or `none` |
| `garments` | `volume` (sleeves and trousers with cuffs, the default), `skin` or `none` |
| `skirt`, `legwear` | a colour for a flared skirt; legs then come out of its hem in `legwear` |
| `arms`, `legs` | `((dx, dy), (dx, dy))`: where each hand or foot goes, in limb widths from the shoulder or hip; `None` hangs |
| `hands` | a pose per hand: `open`, `point`, `fist`, `peace`, `pinch`, `thumbsup`, `grip`, `wave` |
| `props` | per hand, an SVG string or a function `(x, y, rot, fw)` that draws what the hand holds (use with `grip`) |
| `eyes`, `mouth_kind` | eyes `dot`, `wide`, `closed`, `happy`, `flat`, `heart`; mouth `smile`, `flat`, `small`, `o`, `open`, `grin`, `smirk`, `frown`, `none` |
| `accessories` | any of `glasses`, `scarf`, `bow`, `badge` |
| `lean`, `head_dx`, `head_dy` | the line of action: torso lean and head offset |
| `arm_bow`, `leg_bow` | how far each limb bends, as a fraction of its length (one number, or one per limb); below zero bows a knee or elbow outward |
| `arm_z` | per arm, `front` (over the torso), `behind` (under it), `hidden`, or `None` to let the view decide |
| `front_arm`, `front_leg` | which arm and which leg (0 or 1, as you see them) is drawn over the other; `None` puts the nearer one on top |
| `under`, `mid`, `over` | functions `(g)` for parts behind everything, under the torso, or on top (ears, tails) |
| `ground_shadow` | a soft shadow under the feet |
| `uid` | a unique id per figure, so clip paths don't collide |

The pieces it is built from are there to use on their own: `head`, `eye`, `mouth`, `hand`, `shoe`, `bare_foot`,
`tube`, `sleeve`, `band`, `opening`, `blob`, `outline`, `line`, `flat`, `ellipse_path`, `limb_curve`, `cpath`,
and the effects `sparkle`, `drop`, `flame`, `splash`, `lobes` (clouds and steam). Read their docstrings in `house.py`.

Never scale a figure by its arguments to make it smaller: the line weight is fixed, so the ink would get heavy. Draw at
full size and wrap it in `<g transform="scale(0.5)">`. Keep heads at least about 70 px tall on a 1600×1000 sheet, or
cuffs and shadows stop reading.

## How to work

1. Write `draw_<thing>.py` that does `from house import *` and writes an SVG. One `uid` per figure.
2. Render it at 1×, for example with headless Chrome or Chromium:
   `chromium --headless=new --hide-scrollbars --window-size=640,800 --screenshot=wave.png file://$PWD/wave.svg`
   (or with Playwright, or `rsvg-convert -o wave.png wave.svg`).
3. Look at the PNG yourself before calling it done. Check the rules above one by one: line weight, palette, hands and
   feet, openings with lips, tangents. Collisions are obvious to the eye.
4. Fix the weakest thing and render again. Change one thing at a time.
5. Hand back the SVG and the PNG.

## A drawing that draws itself

```sh
HOUSE_TAGS=1 python3 draw_wave.py               # tags each part, so characters are drawn head first
python3 drawon.py wave.svg wave-draws.svg       # [--budget 12] caps the line work, in seconds
python3 drawon.py wave.svg wave-draws.svg --preview wave.mp4   # also an MP4 and a GIF (needs Playwright and ffmpeg)
```

`wave-draws.svg` replays the drawing: every ink line at one pen speed, then the flat colours, the shadows and the
effects. It is plain SVG animation with no script, so it plays anywhere an SVG shows, including an `<img>` tag. It
also plays in an ordinals explorer once inscribed. Inscribe it compressed
(`ord wallet inscribe --fee-rate N --file wave-draws.svg --compress`): a self-drawing SVG often shrinks to about a
tenth of its size, and the fee with it.

## Make it move

A character from `figure()` is already a rig. A pose is a dict of its arguments (where the hands and feet go, the
lean, the head, the hand poses, the face), and every pose in one view draws the same shapes with the same path
commands, so only numbers change from pose to pose. `rig.py` reads poses off a timeline, draws a frame for each, and
merges the frames into one SVG in which every shape tweens with SMIL. It needs no script and plays anywhere an SVG
does, including an `<img>` tag.

```python
from house import *
from rig import Timeline, animate, page, ease, overshoot

def draw(p):
    hop = p.pop("hop", 0.0)          # lift the whole figure: the rig animates transforms too
    body = figure(320, 720, view="front", shirt=MINT, pants=SKY, shoes=YEL, hair=(PINK, "cap"), uid="w", **p)
    return f'<g transform="translate(0 {-hop:.1f})">{body}</g>'

LEFT = dict(arms=(None, (2.4, -6.2)), hands=("open", "wave"), hand_rot=(0, -26), head_dx=-3.0, lean=-0.01, hop=0.0)
RIGHT = dict(LEFT, arms=(None, (4.8, -4.4)), hand_rot=(0, 30), head_dx=4.0, lean=0.03, hop=6.0)
tl = Timeline([(0.0, LEFT), (0.3, RIGHT, overshoot), (0.6, LEFT, ease)], loop=True)
open("wave-loop.svg", "w").write(page(animate(draw, tl, T=0.6, fps=12), 640, 800))
```

- `Timeline(keys, loop=True)` takes key poses at times in seconds. A key can name the easing of the move into it:
  `ease` (slow in and out, the default), `ease_in`, `ease_out`, `overshoot` (past the mark and back) or `linear`.
  Numbers and tuples of numbers blend between keys; anything else (a hand pose, the eyes, the view) switches halfway.
- `animate(draw, tl, T, fps=12, cuts=True, tolerance=0.3)` returns the moving drawing. Wrap it in `page(body, w, h)`.
  A shape that changes kind on some frames (an eye that blinks shut, a mouth that opens) is swapped for its other
  version on those frames. A change of view, or of which limb is drawn over which, changes the whole drawing: with
  `cuts=True` the rig cuts to a copy drawn that way, which is how a spin works; without it, `animate` raises
  `RigError` naming the first difference. `tolerance` (px) drops keys that a straight tween reproduces that closely,
  for a smaller file.
- The house rate is 12 frames a second, with the tweening in between.
- Anticipate a big move and follow it through: crouch before a jump, rise fast, hang at the top, fall fast (a height
  of `4*h*u*(1 - u)` over the jump), let the knees take the landing, and let ears, hair or a tail overshoot and settle
  a frame or two after the body.
- The first frame is what a viewer without SMIL sees, so start on the pose that stands for the whole.
- Check it frame by frame before handing it back: pause the SVG in a browser at a few times
  (`svg.pauseAnimations(); svg.setCurrentTime(t)`) and look at each one, or draw `draw(tl(t))` as stills.

`rig/hello.svg` on the site is a longer piece made this way: Bunny and Unicorn crouch, jump, spin, land, wave and
turn to each other. The playground at `rig/` poses them by hand; Copy pose gives the pose as JSON, which
`rigplay.py` (served with the playground under `rig/py/`) draws.

For a scene that isn't one character, write it as `frame(t)` returning a whole SVG, render the frames with
Playwright, then `ffmpeg -framerate 24 -i f%04d.png -vf format=yuv420p -c:v libx264 -crf 18 loop.mp4` for video, or
palettegen and paletteuse for a GIF.
