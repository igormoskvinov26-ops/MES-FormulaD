import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

/** QR-код на стороне браузера (Этап 7, DEVELOPMENT_PLAN.md) — кодирует переданное значение как есть,
    без сетевых обращений. Для JobCard это VIN (мой ответ по умолчанию на В-12 спецификации). */
export function Qr({ value, size = 120 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(false);
    QRCode.toCanvas(canvas, value, { width: size, margin: 1 }).catch(() => setError(true));
  }, [value, size]);

  if (error) {
    return (
      <span className="qr-error" role="img" aria-label={`QR-код для ${value} не сформирован`}>
        QR
      </span>
    );
  }

  return <canvas ref={canvasRef} role="img" aria-label={`QR-код: ${value}`} width={size} height={size} />;
}
