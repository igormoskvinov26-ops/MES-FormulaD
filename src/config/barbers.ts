import { env } from './env.js';

/**
 * Per-barber configuration.
 *
 * Business logic is keyed on the numeric YCLIENTS staff id, NEVER on the name
 * string. Staff ids come from environment variables and must be real YCLIENTS
 * ids — no invented values. A barber without a configured id is disabled.
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

function toStaffId(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Supported barbers. Names are fixed per the spec (Арташ, Ксения, Дмитрий);
 * their staff ids are injected from env so nothing is hard-coded/fabricated.
 * `enabled` is derived from whether a real staff id is present.
 */
export const BARBERS: BarberConfig[] = [
  makeBarber({
    slug: 'artash',
    displayName: 'Арташ',
    template: 'artash',
    staffId: toStaffId(env.barberStaffIds.artash),
  }),
  makeBarber({
    slug: 'ksenia',
    displayName: 'Ксения',
    template: 'ksenia',
    staffId: toStaffId(env.barberStaffIds.ksenia),
  }),
  makeBarber({
    slug: 'dmitriy',
    displayName: 'Дмитрий',
    template: 'dmitriy',
    staffId: toStaffId(env.barberStaffIds.dmitriy),
  }),
];

function makeBarber(input: {
  slug: string;
  displayName: string;
  template: string;
  staffId: number;
}): BarberConfig {
  return {
    yclientsStaffId: input.staffId,
    slug: input.slug,
    displayName: input.displayName,
    template: input.template,
    enabled: input.staffId > 0,
  };
}

/** Barbers that are actually usable (have a real staff id and are enabled). */
export function activeBarbers(): BarberConfig[] {
  return BARBERS.filter((b) => b.enabled && b.yclientsStaffId > 0);
}

export function barberByStaffId(staffId: number): BarberConfig | undefined {
  return BARBERS.find((b) => b.yclientsStaffId === staffId);
}

export function barberBySlug(slug: string): BarberConfig | undefined {
  return BARBERS.find((b) => b.slug === slug);
}
