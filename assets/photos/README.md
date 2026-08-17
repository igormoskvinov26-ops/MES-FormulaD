# Barber photos — Story backgrounds

Drop each barber's **real** photo here, named by slug:

```
assets/photos/artash.jpg      (or .jpeg / .png)
assets/photos/ksenia.jpg
assets/photos/dmitriy.jpg
```

- Portrait orientation, ideally **1080×1920** (9:16). Other sizes are
  center-cropped to fill (`preserveAspectRatio="xMidYMid slice"`).
- The layout is two-column: the barber stands on one side, the free-time slots
  are a serif column on the **opposite** side. Shoot/crop each barber on their
  configured side so the slots don't cover them:
  - `artash` → **left**, `dmitriy` → **left**, `ksenia` → **right**
    (set per template via `photoSide` in `src/config/templates.ts`).
- Best on the brand's dark textured wall (like the approved design) so the photo
  blends into the composition. Keep the upper-center clear for the logo +
  «СВОБОДНЫЕ СЛОТЫ» / «БАРБЕР {ИМЯ}» heading.
- These must be **real supplied photos** — never AI-generated (spec §43).

When a barber has no photo here yet, the Story falls back to a dark gradient
background with a "ФОТО МАСТЕРА" placeholder, so the pipeline still works.

One Story is produced per barber who is **on shift today and has free windows**
(their photo + their slots). No photo file is committed by default.
