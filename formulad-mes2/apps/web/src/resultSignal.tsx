import { useEffect, useRef, useState } from 'react';

/**
 * Результат скана должен быть виден и слышен с расстояния: оператор смотрит на изделие, а не на экран.
 * Крупная вспышка по краю экрана с текстом результата + короткий сигнал (WebAudio, без файлов).
 * Вспышка декоративна (`aria-hidden`), текст результата остаётся в баннере `role="status"`.
 */
const SOUND_KEY = 'f7-sound';
const SOUND_EVENT = 'f7-sound-change';
const SHOW_MS = 1800;

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* без localStorage выбор действует до перезагрузки */
  }
  window.dispatchEvent(new Event(SOUND_EVENT));
}

export function subscribeSound(listener: () => void): () => void {
  window.addEventListener(SOUND_EVENT, listener);
  return () => window.removeEventListener(SOUND_EVENT, listener);
}

function beep(kind: 'ok' | 'error') {
  if (!isSoundOn()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    // Успех — две восходящие чистые ноты; отказ — два низких жёстких тона.
    const notes = kind === 'ok'
      ? [{ f: 880, t: 0, d: 0.11 }, { f: 1320, t: 0.12, d: 0.18 }]
      : [{ f: 300, t: 0, d: 0.2 }, { f: 200, t: 0.22, d: 0.3 }];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'ok' ? 'sine' : 'square';
      osc.frequency.value = n.f;
      const at = ctx.currentTime + n.t;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + n.d + 0.02);
    }
    setTimeout(() => void ctx.close().catch(() => undefined), 900);
  } catch {
    /* звук — дополнение: любой сбой аудио не должен мешать работе */
  }
}

export type ResultSignal = { key: number; kind: 'ok' | 'error'; text: string };

/** Показывает вспышку и играет сигнал при каждом новом сообщении об итоге операции. */
export function useResultSignal(message: { kind: 'ok' | 'error'; text: string } | null): ResultSignal | null {
  const [signal, setSignal] = useState<ResultSignal | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (!message) {
      setSignal(null);
      return;
    }
    counter.current += 1;
    setSignal({ key: counter.current, kind: message.kind, text: message.text });
    beep(message.kind);
    const timer = setTimeout(() => setSignal(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return signal;
}

export function ResultFlash({ signal }: { signal: ResultSignal | null }) {
  if (!signal) return null;
  return (
    <div key={signal.key} className="result-flash" data-kind={signal.kind} aria-hidden="true">
      <div className="result-flash__card" data-text={signal.text} />
    </div>
  );
}

export function SoundToggle() {
  const [on, setOn] = useState(isSoundOn);
  useEffect(() => subscribeSound(() => setOn(isSoundOn())), []);
  return (
    <button
      type="button"
      className="ghost icon-btn"
      aria-pressed={on}
      aria-label="Звук результата скана"
      title={on ? 'Звук включён: нажмите, чтобы выключить' : 'Звук выключен: нажмите, чтобы включить'}
      onClick={() => setSoundOn(!on)}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h3l4-3v10l-4-3H3z" />
        {on ? <path d="M12.5 6.5a3.5 3.5 0 0 1 0 5M14.5 4.5a6.5 6.5 0 0 1 0 9" /> : <path d="M12.5 7l4 4m0-4l-4 4" />}
      </svg>
    </button>
  );
}
