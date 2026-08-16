import { getSettings } from '../../config/settings.js';
import { logger } from '../../lib/logger.js';

/**
 * YCLIENTS connection wizard helpers used by the Settings UI.
 *
 * These call the API directly (not via the main client) because they are used
 * BEFORE the full config exists — e.g. authenticating to obtain a user token, or
 * listing companies before a company id is known. They read the partner/user
 * tokens live from settings and never log them.
 */

function base(): string {
  return getSettings().yclients.apiBase.replace(/\/$/, '');
}

function partnerHeaders(withUser = false): Record<string, string> {
  const y = getSettings().yclients;
  const auth = withUser
    ? `Bearer ${y.partnerToken}, User ${y.userToken}`
    : `Bearer ${y.partnerToken}`;
  return {
    Accept: 'application/vnd.yclients.v2+json',
    'Content-Type': 'application/json',
    Authorization: auth,
  };
}

export type AuthResult = { ok: true; userToken: string; name?: string } | { ok: false; error: string };

/** Exchange manager login/password for a user token (POST /auth). */
export async function authenticate(login: string, password: string): Promise<AuthResult> {
  const partnerToken = getSettings().yclients.partnerToken;
  if (!partnerToken) return { ok: false, error: 'YCLIENTS partner token is not set' };
  try {
    const res = await fetch(`${base()}/auth`, {
      method: 'POST',
      headers: partnerHeaders(false),
      body: JSON.stringify({ login, password }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { user_token?: string; name?: string };
      meta?: { message?: string };
    };
    if (!res.ok || !json.data?.user_token) {
      return { ok: false, error: json.meta?.message || `auth failed (HTTP ${res.status})` };
    }
    return { ok: true, userToken: json.data.user_token, name: json.data.name };
  } catch (err) {
    logger.warn('yclients auth error', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: 'YCLIENTS unreachable' };
  }
}

export type CompanyBrief = { id: number; title: string };

/** List companies the authenticated user manages (GET /companies?my=1). */
export async function listMyCompanies(): Promise<CompanyBrief[]> {
  const res = await fetch(`${base()}/companies?my=1`, { headers: partnerHeaders(true) });
  const json = (await res.json()) as { data?: Array<{ id: number; title?: string; name?: string }> };
  if (!res.ok || !Array.isArray(json.data)) return [];
  return json.data.map((c) => ({ id: c.id, title: c.title || c.name || `#${c.id}` }));
}

export type StaffBrief = { id: number; name: string; specialization?: string; fired?: boolean };

/** List staff for a company (GET /company/{id}/staff/). */
export async function listStaff(companyId: string | number): Promise<StaffBrief[]> {
  const res = await fetch(`${base()}/company/${companyId}/staff/`, { headers: partnerHeaders(true) });
  const json = (await res.json()) as {
    data?: Array<{ id: number; name?: string; specialization?: string; fired?: number }>;
  };
  if (!res.ok || !Array.isArray(json.data)) return [];
  return json.data.map((s) => ({
    id: s.id,
    name: s.name || `#${s.id}`,
    specialization: s.specialization,
    fired: Boolean(s.fired),
  }));
}
