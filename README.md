# Ink Tide

[Open Ink Tide](https://syymza.github.io/ink-tide/)

A browser-only paper-marbling experiment. Begin with a quiet ivory bath, dip into 36 liquid pigments, then draw colour across the surface.

- **Drop:** place individual spreading drops.
- **Round:** a narrow brush. Dip in pigment to load it; rinse in the water pot to move existing colour without adding paint.
- **Fan:** a broader, restrained brush with the same dip/rinse interaction.
- **Comb:** pull parallel ribbons along a curved gesture.

Each brush retains its own loaded colour. Bristles and the small colour/clean label show its state. Undo restores a whole gesture (up to 16 actions); Save paper downloads PNG. D/C select Drop/Comb, and Command/Ctrl-Z undoes. Fresh paper is undoable. On phones the complete paper rotates into portrait orientation, preserving proportions.

The bath uses geometric area displacement and bounded inverse-coordinate maps rather than a physical fluid solver. Water wakes are transient highlights and do not alter stored pigment. Tool wakes settle quickly and clear on interruption or saving. Drops retain their visible spreading state when interrupted or saved. Very fine folded strands can soften at the internal 1020×748 resolution. PNG presentation is 1500×1100, or 1100×1500 in portrait. WebGL2 is required; reduced motion removes decorative waves and shortens spreading.

Work is saved only in this browser when local storage is available; a return visit can recover that browser's work. A fresh browser starts blank. Export PNG for a durable copy. No backend, runtime AI, analytics, external fonts or runtime dependencies.

## Run locally

Serve the project with `python3 -m http.server 8000 --bind 127.0.0.1`, then open http://127.0.0.1:8000/. The runtime is four files: index.html, style.css, app.js and marbling.js.

For development checks: `npm ci`, `npx playwright install chromium`, then `npm run check` and `npm test`. Test dependencies are development-only. GitHub Actions checks the PR before deployment; only the runtime files are uploaded to Pages.

## References

The geometry draws on [Aubrey Jaffer's mathematical marbling](https://arxiv.org/html/1702.02106v4) and [dropping-paint area displacement](https://people.csail.mit.edu/jaffer/Marbling/Dropping-Paint). Traditional patterns can be explored in the [University of Washington marbled-paper collection](https://content.lib.washington.edu/dpweb/patterns.html).
