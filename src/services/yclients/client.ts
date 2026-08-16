import { getSettings, yclientsConfigured } from '../../config/settings.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { withRetry } from '../../lib/retry.js';

/**
 * Low-level YCLIENTS HTTP client.
 *
 * Auth follows the YCLIENTS scheme:
 *   Authorization: Bearer <partner_token>, User <user_token>
 *   Accept: application/vnd.yclients.v2+json
 *
 * Credentials come from the runtime settings store (entered in the Settings UI
 * or seeded from env). They are read live on each call so changes take effect
 * without a restart. No credential is ever logged.
 */
export class YclientsClient {
  private get base(): string {
    return getSettings().yclients.apiBase.replace(/\/$/, '');
  }

  get configured(): boolean {
    return yclientsConfigured();
  }

  private headers(): Record<string, string> {
    const y = getSettings().yclients;
    return {
      Accept: 'application/vnd.yclients.v2+json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${y.partnerToken}, User ${y.userToken}`,
    };
  }

  /** GET a YCLIENTS endpoint and return the parsed `data` field. */
  async get<T = unknown>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    if (!this.configured) throw Errors.yclientsNotConfigured();
    const url = new URL(`${this.base}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
      }
    }
    return withRetry(
      async () => {
        const res = await fetch(url, { method: 'GET', headers: this.headers() });
        if (!res.ok) {
          logger.warn('yclients request failed', {
            path,
            status: res.status,
          });
          throw new Error(`YCLIENTS ${path} → HTTP ${res.status}`);
        }
        const json = (await res.json()) as { success?: boolean; data?: T };
        if (json && typeof json === 'object' && 'data' in json) {
          return json.data as T;
        }
        return json as unknown as T;
      },
      { label: `yclients GET ${path}`, retries: 1, delaysMs: [5000, 30000] },
    );
  }

  get companyId(): string {
    return getSettings().yclients.companyId;
  }
}

let singleton: YclientsClient | null = null;
export function yclientsClient(): YclientsClient {
  if (!singleton) singleton = new YclientsClient();
  return singleton;
}
