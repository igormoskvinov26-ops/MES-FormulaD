/**
 * Telephony/call statistics provider.
 *
 * There is no confirmed call-data source in the current integration, so we do
 * NOT fabricate any numbers (spec §22). The provider interface exists so a real
 * telephony API can be plugged in later without changing the report. Until then
 * `getDailyStats` returns null and the report simply omits the calls block.
 */
export type CallStats = {
  incoming: number | null;
  answered: number | null;
  missed: number | null;
  unique: number | null;
  /** conversion call → booking, 0..1 */
  conversion: number | null;
};

export interface CallStatsProvider {
  getDailyStats(date: Date): Promise<CallStats | null>;
}

/** Default provider — no telephony source connected yet. */
export class NullCallStatsProvider implements CallStatsProvider {
  async getDailyStats(_date: Date): Promise<CallStats | null> {
    return null;
  }
}

let provider: CallStatsProvider = new NullCallStatsProvider();

export function callStatsProvider(): CallStatsProvider {
  return provider;
}

/** Swap the provider when a telephony integration is added. */
export function setCallStatsProvider(p: CallStatsProvider): void {
  provider = p;
}
