# Love Letter: composition rules

Short rules, from real sources, that every beat follows.

## Sources

- **Multiplane camera (Disney):** art sits on glass planes at different distances, and each plane moves past the camera at its own speed. That is where depth comes from. https://en.wikipedia.org/wiki/Multiplane_camera
- **Firewatch site:** the hero is 9 painted layers. Their scroll speeds are 2, 5, 11, 16, 26, 36, 49, 69 and 100 (read from the `data-speed` values in the page's HTML). The steps grow toward the front, so far layers barely move and near ones move a lot. https://www.firewatchgame.com/
- **Aerial perspective:** with distance, contrast drops, detail drops, and colour loses saturation and moves toward the sky colour (usually blue). https://en.wikipedia.org/wiki/Aerial_perspective
- **Matte painting:** far parts of a set are paintings, combined with the near live parts. https://en.wikipedia.org/wiki/Matte_painting
- **Repoussoir:** a dark object on the left or right of the foreground brackets the edge and pulls the eye in. https://en.wikipedia.org/wiki/Repoussoir
- **Rule of thirds:** place the subject on the third lines or their crossings. https://en.wikipedia.org/wiki/Rule_of_thirds

## Rules for this site

1. **Seven planes.** Each one has a fixed scroll speed and a fixed tilt amount (share of the hero's movement, Firewatch style, steps growing toward the front).

| Plane | What | Scroll speed | Tilt | Value | Haze |
|---|---|---|---|---|---|
| 0 Sky | sky dome, sun, stars | 0 (colour only) | 0 | lightest | full |
| 1 Back | back ridge, far cloud bank | 0.45 | 0.05 | light | 0.30 |
| 2 Far | far ridges, far clouds | 0.60 | 0.12 | light-mid | 0.20 |
| 3 Mid | pine rows, mid clouds | 0.80 (3D depth) | 0.35 | mid | 0.08 to 0.15 |
| 4 Hero | house, balloon, letter | 1.00 | 0 (camera aims here) | full range, darkest ink | 0 |
| 5 Near | ferns, grass, near clouds | 1.30 | 0.6 | darker (0.75) | 0 |
| 6 Frame | framing trunks, boughs, corner clouds | 1.50 | 0.8 | darkest (0.6) | 0 |

2. **The subject is the focal point.** It is the only thing with full contrast and the darkest ink. The red balloon is the one strong colour.
2. **Clear window.** Planes 5 and 6 stay at the edges and corners like a vignette. They never cover the house, balloon or letter, at any scroll point or tilt, on phone or desktop. Their tilt travel is capped so they cannot swing in.
3. **Thirds.** The subject sits on the upper-middle third line, above the pinned text band at the bottom.
4. **Things leave by moving.** Nothing turns off or fades out to change the scene. Far planes leave by their scroll speed, or pass behind cloud or haze.
5. **Ink fades with depth.** Ink is strongest on the hero, thinner on mid, none on back.
