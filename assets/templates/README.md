# Story templates — fixed brand designs

Each barber has a **fixed** 1080×1920 Story background design supplied by a
designer:

```
assets/templates/artash.svg
assets/templates/ksenia.svg
assets/templates/dmitriy.svg
```

These are the fixed compositions (master photo, background, brand elements).
The backend never invents a new composition (spec §8) — only the dynamic slot
values (and, if needed, the date) change between renders.

The `.svg` files currently committed here are **neutral placeholders** so the
render pipeline works end-to-end. Replace each with the real approved artwork.
Master photos must be the real supplied photos — never generated (spec §43).

The fixed brand copy (headline, CTA, brand phrase) is drawn by the renderer on
top of the background so it stays crisp and the CTA hit-area stays aligned to
the configured `ctaArea`.
