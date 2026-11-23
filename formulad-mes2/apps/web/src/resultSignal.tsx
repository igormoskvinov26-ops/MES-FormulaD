import { useEffect, useRef, useState } from 'react';

const SOUND_KEY = 'f7-sound';
const SOUND_EVENT = 'f7-sound-change';
const SHOW_MS = 1800;
const MAX_SOUND_BYTES = 500 * 1024;
const SOUND_OK_KEY = 'f7-sound-ok-data';
const SOUND_ERR_KEY = 'f7-sound-error-data';

export function getCustomSoundDataUrl(kind: 'ok' | 'error'): string | null {
  try { return localStorage.getItem(kind === 'ok' ? SOUND_OK_KEY : SOUND_ERR_KEY); } catch { return null; }
}

export function setCustomSoundDataUrl(kind: 'ok' | 'error', dataUrl: string | null): void {
  try {
    const key = kind === 'ok' ? SOUND_OK_KEY : SOUND_ERR_KEY;
    if (dataUrl) localStorage.setItem(key, dataUrl); else localStorage.removeItem(key);
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(SOUND_EVENT));
}

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
  const dataUrl = getCustomSoundDataUrl(kind);
  if (dataUrl) { try { const a = new Audio(dataUrl); void a.play(); } catch { /* fall through */ } return; }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
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

export function SoundFileSettings() {
  const [okName, setOkName] = useState(() => getCustomSoundDataUrl('ok') ? 'файл загружен' : '');
  const [errName, setErrName] = useState(() => getCustomSoundDataUrl('error') ? 'файл загружен' : '');
  const [err, setErr] = useState('');

  function handleFile(kind: 'ok' | 'error', file: File | null) {
    setErr('');
    if (!file) { setCustomSoundDataUrl(kind, null); kind === 'ok' ? setOkName('') : setErrName(''); return; }
    if (file.size > MAX_SOUND_BYTES) { setErr('Файл больше 500 КБ'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCustomSoundDataUrl(kind, dataUrl);
      kind === 'ok' ? setOkName(file.name) : setErrName(file.name);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12 }}>Звук «Успех» (MP3/WAV/OGG, ≤ 500 КБ)</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/*" onChange={e => handleFile('ok', e.target.files?.[0] ?? null)} />
          {okName && <button type="button" onClick={() => handleFile('ok', null)} title="Удалить файл">×</button>}
        </div>
        {okName && <small className="muted">{okName}</small>}
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12 }}>Звук «Ошибка» (MP3/WAV/OGG, ≤ 500 КБ)</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/*" onChange={e => handleFile('error', e.target.files?.[0] ?? null)} />
          {errName && <button type="button" onClick={() => handleFile('error', null)} title="Удалить файл">×</button>}
        </div>
        {errName && <small className="muted">{errName}</small>}
      </label>
      {err && <p role="alert" className="error" style={{ fontSize: 12 }}>{err}</p>}
      <small className="muted">Файл хранится в браузере (localStorage). Если не задан — используется встроенный тон.</small>
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
