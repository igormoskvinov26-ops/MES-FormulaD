# Barber photos — Story backgrounds

Drop each barber's **real** photo here, named by slug:

```
assets/photos/artash.jpg      (or .jpeg / .png)
assets/photos/ksenia.jpg
assets/photos/dmitriy.jpg
```

- Portrait orientation, ideally **1080×1920** (9:16). Other sizes are
  center-cropped to fill (`preserveAspectRatio="xMidYMid slice"`).
- Keep the face in the **upper/middle** area — the lower third is covered by a
  dark scrim where the free-time slots and the «ЗАПИСАТЬСЯ →» button sit.
- These must be **real supplied photos** — never AI-generated (spec §43).

When a barber has no photo here yet, the Story falls back to a dark gradient
background with a "ФОТО МАСТЕРА" placeholder, so the pipeline still works.

One Story is produced per barber who is **on shift today and has free windows**
(their photo + their slots). No photo file is committed by default.
