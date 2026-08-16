import { getSettings } from '../../config/settings.js';
import type { TemplateConfig } from '../../config/templates.js';
import type { StoryArea } from '../telegram/types.js';

/**
 * Build the Telegram Story link area(s) from the template's configured CTA area.
 * The link points at BOOKING_URL, making "ЗАПИСАТЬСЯ →" actually clickable.
 *
 * The CTA coordinates live in template config (spec §12) — never hard-coded
 * inside the Telegram function. Telegram story areas use percentage positions,
 * so we convert the normalized (0..1) area to 0..100 percentages.
 */
export function buildCtaStoryAreas(template: TemplateConfig): StoryArea[] {
  const a = template.ctaArea;
  return [
    {
      position: {
        x_percentage: round2(a.x * 100),
        y_percentage: round2(a.y * 100),
        width_percentage: round2(a.width * 100),
        height_percentage: round2(a.height * 100),
        rotation_angle: 0,
      },
      type: { type: 'link', url: getSettings().bookingUrl },
    },
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
