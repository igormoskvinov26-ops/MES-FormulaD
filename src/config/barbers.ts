import { getSettings, type BarberSetting } from './settings.js';

/**
 * Per-barber configuration.
 *
 * Business logic is keyed on the numeric YCLIENTS staff id, NEVER on the name
 * string. Staff ids come from the runtime settings store (Settings UI / env
 * seed) and must be real YCLIENTS ids — no invented values. A barber without a
 * configured id is disabled.
 */
export type BarberConfig = {
  /** Real YCLIENTS staff id. 0 means "not configured / disabled". */
  yclientsStaffId: number;
  /** Stable slug used for template lookup and state keys. */
  slug: string;
  /** Human-facing display name (Stories/reports only, not for logic). */
  displayName: string;
  /** Template id (see config/templates.ts). */
  template: string;
  /** Whether this barber participates in automatic Stories. */
  enabled: boolean;
};

function toConfig(b: BarberSetting): BarberConfig {
  return {
    yclientsStaffId: b.staffId,
    slug: b.slug,
    displayName: b.displayName,
    template: b.template,
    enabled: b.enabled && b.staffId > 0,
  };
}

/** All configured barbers (live from settings). */
export function allBarbers(): BarberConfig[] {
  return getSettings().barbers.map(toConfig);
}

/** Barbers that are actually usable (have a real staff id and are enabled). */
export function activeBarbers(): BarberConfig[] {
  return allBarbers().filter((b) => b.enabled && b.yclientsStaffId > 0);
}

export function barberByStaffId(staffId: number): BarberConfig | undefined {
  return allBarbers().find((b) => b.yclientsStaffId === staffId);
}

export function barberBySlug(slug: string): BarberConfig | undefined {
  return allBarbers().find((b) => b.slug === slug);
}
