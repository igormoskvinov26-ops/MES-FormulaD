import type { Screen } from './AppHeader';
import { api } from './api';
import { ScanTransitionScreen } from './ScanTransitionScreen';

/** Запуск в производство: 0 → 1 (раздел 10 спецификации). Механика — в ScanTransitionScreen. */
export function StartScreen({
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
      screen="start"
      session={session}
      onNavigate={onNavigate}
      onLogout={onLogout}
      title="Запуск в производство"
      eligibleStatusId={0}
      afterStatusId={1}
      confirmLabel="Запустить"
      listTitle="Ожидают запуска"
      onConfirm={(vin) => api.start(vin)}
    />
  );
}
