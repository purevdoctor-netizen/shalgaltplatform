/**
 * Камерын QR уншигч (`html5-qrcode`).
 *
 * ⚠ Браузерын secure-context дүрмээр камер зөвхөн `https://` эсвэл `localhost`
 * дээр ажиллана. LAN горимын `http://192.168.x.x` дээр ажиллахгүй тул
 * хэрэглэгчид тодорхой мессеж харуулна.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff } from 'lucide-react';
import { useT } from '../../i18n';
import { Alert, Button } from '../ui';

const ELEMENT_ID = 'qr-reader';

export function QrScanner({
  onScan,
  autoStart = false,
}: {
  /** Уншсан текст. Ижил кодыг дараалан уншихаас сэргийлэх нь дуудагчийн үүрэг. */
  onScan: (text: string) => void;
  autoStart?: boolean;
}) {
  const t = useT();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  onScanRef.current = onScan;

  const secureContext =
    typeof window !== 'undefined' &&
    (window.isSecureContext || window.location.hostname === 'localhost');

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      // Аль хэдийн зогссон байж болно
    }
    scannerRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (scannerRef.current) return;
    setError(null);

    if (!secureContext) {
      setError(t('collect.cameraHttps'));
      return;
    }

    try {
      const scanner = new Html5Qrcode(ELEMENT_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decoded) => onScanRef.current(decoded),
        () => {
          // Frame бүрт "олдсонгүй" гэж дуудагддаг — үл тоомсорлоно
        },
      );
      setActive(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(t('collect.cameraError', { message }));
      scannerRef.current = null;
      setActive(false);
    }
  }, [secureContext, t]);

  useEffect(() => {
    if (autoStart) void start();
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div id={ELEMENT_ID} className="mx-auto w-full max-w-sm" />

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex justify-center gap-2">
        {active ? (
          <Button variant="secondary" onClick={() => void stop()}>
            <CameraOff className="h-4 w-4" aria-hidden="true" />
            {t('collect.stopCamera')}
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={!secureContext}>
            <Camera className="h-4 w-4" aria-hidden="true" />
            {t('collect.startCamera')}
          </Button>
        )}
      </div>
    </div>
  );
}
