import type { Screen } from './AppHeader';
import { api } from './api';
import { ScanTransitionScreen } from './ScanTransitionScreen';

/**
 * Final OK: 2 → 3 (раздел 18 спецификации). Допуск проверяется ДО подтверждения
 * (extraCheck): незакрытая обязательная деталь (раздел 16) видна сразу при сканировании,
 * а не только после отказа POST /fok.
 */
export function FokScreen({
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
      screen="fok"
      session={session}
      onNavigate={onNavigate}
      onLogout={onLogout}
      title="Final OK"
      eligibleStatusId={2}
      afterStatusId={3}
      confirmLabel="Подтвердить FOK"
      listTitle="Ожидают FOK"
      onConfirm={(vin) => api.fok(vin)}
      extraCheck={async (item) => {
        const missing = await api.ncpMissingParts(item.vin);
        return missing.length > 0
          ? `Есть незакрытая обязательная деталь: ${missing.map((m) => m.number).join(', ')}.`
          : null;
      }}
    />
  );
}
