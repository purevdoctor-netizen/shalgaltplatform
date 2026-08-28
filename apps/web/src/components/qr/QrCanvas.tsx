/**
 * QR кодыг canvas дээр зурна. PNG болгож татах боломжтой.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import QRCode from 'qrcode';

export interface QrCanvasHandle {
  /** PNG data URL буцаана (татах, .docx-д оруулахад). */
  toDataUrl: () => string | null;
  getCanvas: () => HTMLCanvasElement | null;
}

interface QrCanvasProps {
  value: string;
  /** Пиксел хэмжээ. Проекторт ≥ 320 байхыг зөвлөнө. */
  size?: number;
  className?: string;
  alt?: string;
  onError?: (message: string) => void;
}

export const QrCanvas = forwardRef<QrCanvasHandle, QrCanvasProps>(function QrCanvas(
  { value, size = 320, className, alt, onError },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    toDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? null,
    getCanvas: () => canvasRef.current,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || value === '') return;

    let cancelled = false;

    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      // Даалгаврын шаардлага: алдаа засах түвшин M
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        onError?.(message);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size, onError]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-danger-100 bg-danger-50 p-6 text-center text-sm text-danger-700"
        style={{ width: size, height: size }}
        role="alert"
      >
        {error}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={alt ?? 'QR код'}
      width={size}
      height={size}
    />
  );
});
