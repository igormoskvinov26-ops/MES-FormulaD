import { useCallback, useEffect, useState } from 'react';
import type { Screen } from './AppHeader';
import { ScanTransitionScreen } from './ScanTransitionScreen';
import { api, type NcpItem } from './api';
import { NcpDetails } from './NcpDetails';

/**
 * Несоответствия найденного изделия прямо внутри карточки Rework (раздел 17, [С]):
 * «пользователь окна Rework может открыть NCP, установить деталь, закрыть NCP» — без перехода
 * на отдельный экран. После любого действия вызывает `onChanged`, чтобы ScanTransitionScreen
 * заново проверил допуск к «Завершить Rework» без повторного скана.
 */
function ReworkNcpPanel({ vin, onChanged }: { vin: string; onChanged: () => void }) {
  const [items, setItems] = useState<NcpItem[]>([]);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    api
      .ncpList({ vin, status: null, page: 1, pageSize: 100 })
      .then((result) => setItems(result.items))
      .catch(() => setItems([]));
  }, [vin]);

  useEffect(reload, [reload]);

  const total = items.length;
  const resolved = items.filter((i) => i.partInstalled).length;

  async function setInstalled(id: number, installed: boolean) {
    setError('');
    try {
      await api.ncpSetPartInstalled(id, installed);
      reload();
      onChanged();
    } catch {
      setError('Не удалось обновить признак установки детали');
    }
  }

  async function close(id: number, comment: string | null) {
    setError('');
    try {
      await api.ncpClose(id, comment);
      reload();
      onChanged();
    } catch {
      setError('Не удалось закрыть заявку');
    }
  }

  return (
    <div className="rework-ncp">
      <p className="rework-ncp-summary">
        Всего NCP: <strong>{total}</strong> · Устранено: <strong>{resolved}</strong> · Осталось:{' '}
        <strong>{total - resolved}</strong>
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {total === 0 && <p className="muted">Несоответствий по изделию нет</p>}
      {items.map((item) => (
        <NcpDetails
          key={item.id}
          item={item}
          onSetPartInstalled={(installed) => void setInstalled(item.id, installed)}
          onClose={(comment) => void close(item.id, comment)}
        />
      ))}
    </div>
  );
}

/**
 * Rework Zone (раздел 17, Этап 6 плана): экран для изделий в статусе 4 — та же механика
 * сканирования, что у Старта/Завершения/FOK (eligibleStatusId=4 → confirm переводит в 2),
 * расширенная списком NCP прямо в карточке и повторной проверкой обязательной детали на
 * confirm (как у FOK — см. backend /production-plan/{vin}/rework/finish).
 */
export function ReworkScreen({
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
      screen="rework"
      session={session}
      onNavigate={onNavigate}
      onLogout={onLogout}
      title="Rework Zone"
      eligibleStatusId={4}
      afterStatusId={2}
      confirmLabel="Завершить Rework"
      listTitle="В Rework"
      onConfirm={(vin) => api.finishRework(vin)}
      extraCheck={async (item) => {
        const missing = await api.ncpMissingParts(item.vin);
        if (missing.length === 0) return null;
        const numbers = missing.map((m) => m.number).join(', ');
        return `Есть незакрытая обязательная деталь: ${numbers}.`;
      }}
      extraContent={(item, refresh) => <ReworkNcpPanel vin={item.vin} onChanged={refresh} />}
    />
  );
}
