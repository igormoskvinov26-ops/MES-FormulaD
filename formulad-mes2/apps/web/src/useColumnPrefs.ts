import { useEffect, useState } from 'react';
import { COLUMNS, DEFAULT_VISIBLE } from './columns';

const STORAGE_KEY = 'formulad.mes.plan.columns.v1';

export function useColumnPrefs() {
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return DEFAULT_VISIBLE;
      const keys = JSON.parse(stored) as string[];
      const known = keys.filter((key) => COLUMNS.some((c) => c.key === key));
      return known.length > 0 ? known : DEFAULT_VISIBLE;
    } catch {
      return DEFAULT_VISIBLE;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visible));
    } catch {
      // Приватный режим или заблокированное хранилище: разкладка просто не запомнится.
    }
  }, [visible]);

  const toggle = (key: string) =>
    setVisible((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  return { visible, toggle, reset: () => setVisible(DEFAULT_VISIBLE) };
}
