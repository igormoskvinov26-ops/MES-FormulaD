import { useEffect, useState } from 'react';
import { COLUMNS, DEFAULT_VISIBLE } from './columns';

const STORAGE_KEY = 'formulad.mes.plan.columns.v1';

/**
 * Набор видимых колонок, сохраняемый в браузере рабочего места.
 * ponytail: localStorage, а не настройки на сервере — у нас пока нет настоящих
 * учётных записей, а рабочее место закреплено за человеком. Когда появится
 * корпоративный вход, раскладку можно будет перенести в профиль пользователя
 * на сервере, чтобы она ездила за ним между компьютерами.
 */
export function useColumnPrefs() {
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return DEFAULT_VISIBLE;
      const keys = JSON.parse(stored) as string[];
      // Отбрасываем колонки, которых больше нет в программе.
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
      // Приватный режим или заблокированное хранилище: раскладка просто не запомнится.
    }
  }, [visible]);

  const toggle = (key: string) =>
    setVisible((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  return { visible, toggle, reset: () => setVisible(DEFAULT_VISIBLE) };
}
