import type { Screen } from './AppHeader';
import { api } from './api';
import { ScanTransitionScreen } from './ScanTransitionScreen';

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
