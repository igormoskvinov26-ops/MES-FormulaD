# Brand logo — DO NOT GENERATE

The **original, designer-provided** РублЪ logo is installed here:

```
assets/logo/rubl_logo.png         → primary (gold on black plate) used by templates
assets/logo/rubl_logo_gold.png    → gold variant   (Золотой)
assets/logo/rubl_logo_milk.png    → cream variant  (Молочный)
assets/logo/rubl_logo_black.png   → black variant  (Чёрный, for light backgrounds)
assets/logo/rubl_logo_source.pdf  → vector source (3 pages: gold / cream / black)
```

All raster files are the original 3508×2480 exports supplied by the client.

## Critical rule (spec §7)

The РублЪ brand logo must **NEVER** be generated, redrawn, recreated, traced,
approximated, AI-generated, or altered in any way (letters, the razor inside the
mark, proportions, or a "similar" version).

Only the following are allowed:

- proportional scaling,
- positioning,
- technical export.

The renderer uses the original asset as-is (scaled/positioned via CSS
`object-fit: contain`). To switch the active variant, change `logoAsset` in
`src/config/templates.ts` (e.g. to `logo/rubl_logo_milk.png`) — do not edit the
image itself.

If the file is ever missing, the renderer falls back to a neutral, clearly
labeled placeholder box (never an imitation of the brand mark).
