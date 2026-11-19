# Sounds

Every scene sound is a real field recording, CC0 (public domain) from Freesound. Nothing in the scene is synthesized.
All are low-passed and kept quiet, and the beds crossfade slowly by scroll. Built by `tools/sound2.sh`.
Sound starts only after the first tap or key press.

## Beds (loops)

| File | Use | Source |
|---|---|---|
| snd/pines | wind in the pines (house) | [breeze.wav](https://freesound.org/s/181801/) by keweldog |
| snd/leaves | soft leaves (house) | [Rustling Foliage in Forest](https://freesound.org/s/635053/) by sillygrizzlies |
| snd/fire | quiet crackle near the house | [fire crackles](https://freesound.org/s/563766/) by florianreichelt |
| snd/air | soft high wind (balloon) | [a gentle breeze, wind 2](https://freesound.org/s/181251/) by mario1298 |
| snd/night | calm far crickets (letter) | [Ambiance Nature Night Cricket Calm Loop](https://freesound.org/s/637083/) by Nox_Sound |

## Taps on scene objects

| File | Object | Source |
|---|---|---|
| snd/creak, snd/crackle | house | [Wooden Creak](https://freesound.org/s/377552/) by Mafon2, [fire crackles](https://freesound.org/s/563766/) by florianreichelt |
| snd/cloth | balloon | [Cloth Flapping On A Clothesline Gently](https://freesound.org/s/330639/) by leonelmail |
| snd/airpush | hover or touch on grass, monstera, pines, boughs and clouds (the only nature sound) | [light slow swoosh](https://freesound.org/s/349698/) by Mikes-MultiMedia (CC0). Cut 0.2 to 1.7 s, high-pass 110 Hz, low-pass 3.2 kHz, 90 ms fade in, 0.4 s fade out, peak -1.3 dBFS |

## UI (unchanged)

| File | Use | Source |
|---|---|---|

## Procedural (not a file)

- **Letter paper:** made live in Web Audio (`paper()` in js/audio.js), Shifat's one exception to recorded sounds. A band-passed noise rustle plus random micro-crackles, after the crumple and rustle models in Andy Farnell's *Designing Sound*. Pointer speed sets loudness, crackle count and brightness; direction sets the filter sweep and pan. Low-passed at 5.5 kHz, every grain has a soft attack. Plays on the interaction channel.
