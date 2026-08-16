import { describe, expect, it, vi } from 'vitest';

async function loadAreas(bookingUrl: string) {
  vi.resetModules();
  process.env.BOOKING_URL = bookingUrl;
  const { buildCtaStoryAreas } = await import('./areas.js');
  const { TEMPLATES } = await import('../../config/templates.js');
  return { buildCtaStoryAreas, TEMPLATES };
}

describe('CTA story areas (spec §12)', () => {
  it('builds a link area from template config pointing at BOOKING_URL', async () => {
    const { buildCtaStoryAreas, TEMPLATES } = await loadAreas('https://n2387007.yclients.com');
    const areas = buildCtaStoryAreas(TEMPLATES.artash!);
    expect(areas).toHaveLength(1);
    const area = areas[0]!;
    expect(area.type).toEqual({ type: 'link', url: 'https://n2387007.yclients.com' });
    // normalized 0..1 → percentage 0..100
    expect(area.position.x_percentage).toBeCloseTo(50, 5);
    expect(area.position.width_percentage).toBeGreaterThan(0);
    expect(area.position.width_percentage).toBeLessThanOrEqual(100);
  });
});
