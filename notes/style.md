# Love Letter style sheet

One hand-painted, calm, cinematic graphic-novel picture with soft toon color. Every element follows these rules.

## Palette
- Forest greens come from the pine painting (tex/tallpine.webp). Grass and monstera use the same three greens, sampled from it by tools/paint_grass_monstera.py: dark, mid, lit, plus one light rim color.
- Sky: morning blue at the top, soft lilac-peach low. Dusk: warm peach and rose. Night: deep navy with a faint cool-rose afterglow low on the horizon.
- Warm accents only on the subjects: window light, the red balloon, the letter paper.
- No sun. No sun disc, no glow ball, no sun setting into the clouds. The warm sky gradient carries the light.

## Value steps
- Each painted element has 2 to 3 flat value steps: shade, mid, lit. No smooth gradients inside a shape.
- Near frame is darkest, the subject area is brightest, far layers are lighter and bluer (aerial perspective).

## Ink lines
- Thin colored ink (not pure black) on the subjects: house, balloon, letter.
- Ink fades with depth. Far cloud cards lift their dark lines toward the paint around them (uInkFade, 0 at z -15, up to 0.85 far away).
- No per-leaf or per-blade ink on plants and grass. Plants read by silhouette and value steps only.

## Brush and texture
- Big simple shapes with clean silhouettes. Grouped masses, not many small bits.
- Grass: only long, curvy S-curve blades in grouped clumps. No short tufts, no seed heads, no speckle.
- Monstera: big heart-shaped leaves with deep side splits and a few holes, on curved dark stems. Used only as edge framing.
- Clouds: whole clouds, cleanly cut out, soft painted bases (fadeBot) so no card edge shows.

## Lighting per beat
- Beat 1, the house: cool morning blue sky, soft light shafts fading near the top, warm window light, low haze between pine rows.
- Beat 2, the balloon: open lilac-blue sky full of whole clouds in 3 depth layers; turns peach and rose on the way up.
- Beat 3, the letter: navy night with stars, a cloud sea below with soft moonlit tops, a faint afterglow on the horizon only.

## Grain
- One light film grain over the whole frame, the same in every beat. No vignettes, glows or shadows on the UI.

## Depth and motion
- One craning camera. Layers stand still in the world, so far layers always move slower.
- One critically damped spring for pointer and touch tilt. No overshoot, nothing switches on or off.
- Front plants and front clouds stay at the edges and corners and never cover the subject.
