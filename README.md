# Johnny Semaan — website

Static site, no build step for the visitor. Served from this folder by GitHub Pages (branch `main`).

## What the page is (5 November 2026)
`index.html` is Alaa's Immersive study (`../Immersive/index.html`), kept exact, with the opening added in front of it. `tools/build-takeover.cjs` builds it: it adds the document envelope (doctype, charset, viewport), the stage, `opening.css` and the scripts, pauses the study's hero intro until the light lifts the black, and copies the study's assets into `assets/`. Edit the study and rebuild; do not edit the study's parts inside `index.html` by hand.

## Sequence
Black → the liquid light writes the signature and the fish (4.5 s) → the hold is the loading page: a percentage under the signature counts while the hero's drawings arrive, at least 2 s, eased, 0.4 s rest at 100 % → the light swims from the fish to the start of the study's name and lifts the black onto the page (3.3 s); the page is paper from the first flood frame and the study's own hero intro (the name writing itself, the block, the sketches, the nav) starts at that moment → the study: statement, works, sketchbook, exhibition, footer.

Reduced motion, or a URL with a hash, skips the opening. A hidden tab pauses it. A height-only resize does not end it; a width change does.

## Files
- `index.html` — built from the study (see above). `opening.css` — the stage, the identity's positions, the loading count. `opening.js` — the opening and the swim. `pigment.js` — the liquid-light engine, unchanged.
- `assets/` — the study's drawings and works (`sk1–5.webp`, `w01–14.jpg`, `exhibition.jpg`, `name.svg`) beside the live site's files.
- Not used by the page any more, kept until frames 6 to 10 of the storyboard decide their fate: `site.js`, `wall.js`, `rotate.js`, `surfacing.js`, `site.css`, `composition.css`, `content.json`, `assets/sketches/`, `assets/paintings/`, `assets/exhibitions/`, `assets/graphite-extraction-v01.png`.

## Review flags on the address
`?stay` parks the site after the writing and the count; `?stay=loop` writes the identity again and again; `?intro=<ms>` the writing's length (4500); `?fill=<ms>` the count's minimum (2000); `?inf` the postponed trial where the count stops at 99 and reads ∞; `?nogl` the no-engine fallback. A resize or reduced motion ends the opening; reload to restart.

## The scrollbar and the root
The page is the study's layout from the first frame: it scrolls from the first frame (no overflow switch, ever), so the study's own scrollbar holds its space from the first frame. No `scrollbar-gutter` and no `::-webkit-scrollbar` rules: in Chrome either one changes what `100vw` measures and the hero's sketches land 5.7 px away from the study's. The opening holds the page at the top by swallowing wheel, touch and keys until the full reveal. Through the opening the bar is invisible over the black root; during the flood `opening.js` (`paintStrip`) fades the study's scrollbar in on the light's own clear curve, in step with the page's right edge, then hands it back to the browser (`scrollbar-color: auto`, the study's pixels). Never a CSS transition or animation on the root: while one runs, Chrome resolves `vw` without the scrollbar and anything placed in `vw` wobbles. `scrollbar-color` is inherited: an inner scrolling element (the frame 7 detail view) sets its own.

## The first moment and the count
The page is black from the first bytes: `html{background:#080706}` right after the charset, `opening.css` inline in `index.html` (`opening.css` is its source), the font stylesheet loads without holding the first paint, and the stage is black until the flood. The count counts the landing's files by real size (`data-assets` on `#loader`, written by the build) and the fonts: at least 2 s, as long as the line needs, never above what has arrived.

## The identity
The name and the fish are the refined drawings of 5 November 2026 (`../identity/refined-v01-2026-11-05/`), shapes only: the build puts them in the light's boxes (name `#e2ded4`, fish `#c2baa8`, the identity lock's colours), in the study's hero name (same box, same writing mask) and in `assets/name.svg`, the signature top left (the study's box and ink).

## Tunables
- `opening.js` → `INTRO`, `MIN_FILL`, `REST`, `FLOOD`, `LIGHT_SOFTNESS` (0.25), `HERO_ASSETS`.
- The study's own tunables are in its stylesheet and script (`../Immersive/index.html`).
