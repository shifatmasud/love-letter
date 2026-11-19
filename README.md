# Above the Pines

A short painted story told by scrolling: a log house in tall pines, a red balloon above the clouds, and a torn letter under the stars.

- Real 3D subjects (house, balloon, letter, hero leaves) with painted maps, 3-step toon light and a thin ink line.
- Painted 2D layers placed in depth for the sky, far pines and clouds.
- Three.js 0.187, Motion 14 for the text, Lenis 1.3 for smooth scroll.
- One `requestAnimationFrame` loop runs Lenis, the scene and the render, so scroll and scene stay locked.
- `?q=low` forces the light tier, `?debug` shows FPS and draw calls.

Plain static files. No build step. `tools/` holds the scripts used to make the paintings and test the page.

By [Shifat Masud](https://shifatmasud-framer.vercel.app/).
