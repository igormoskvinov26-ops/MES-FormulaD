import type { Screen } from './AppHeader';
import { api } from './api';
import { ScanTransitionScreen } from './ScanTransitionScreen';

/**
 * Завершение сборки: 1 → 2 (раздел 13 спецификации). Открытые NCP намеренно не блокируют
 * этот переход — блокировка стоит только на FOK (см. FokScreen.tsx).
 */
export function CompleteScreen({
  session,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  return (
    <ScanTransitionScreen
      screen="complete"
      session={session}
      onNavigate={onNavigate}
      onLogout={onLogout}
      title="Завершение сборки"
      eligibleStatusId={1}
      afterStatusId={2}
      confirmLabel="Завершить"
      listTitle="Ожидают завершения"
      onConfirm={(vin) => api.complete(vin)}
    />
  );
}
