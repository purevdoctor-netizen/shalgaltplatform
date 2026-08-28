/**
 * Алхам 2 — QR код (проекторт зориулсан дэлгэц).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Printer,
} from 'lucide-react';
import { QR_QUESTION_WARN_THRESHOLD } from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import { QrCanvas, type QrCanvasHandle } from '../../components/qr/QrCanvas';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ErrorState,
  LoadingState,
} from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useT } from '../../i18n';
import { config } from '../../config';
import { api } from '../../lib/api';
import { useTeacherExam } from '../../lib/useTeacherExam';
import { buildOfflineExamSlides } from '../../lib/offlineQr';
import { copyToClipboard, cn, safeFileName, shortId } from '../../lib/utils';
import { db } from '../../db';

const AUTO_ADVANCE_MS = 3000;

/**
 * Серверийн LAN хаягуудыг `/api/health`-ээс авна.
 * QR нь `localhost` заасан үед багшид зөв хаягийг санал болгоход хэрэглэнэ.
 */
function useLanAddresses(): string[] {
  const [addresses, setAddresses] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api
      .health()
      .then((health) => {
        if (!cancelled) setAddresses(health.lanAddresses ?? []);
      })
      .catch(() => {
        // Офлайн — санал болгох хаяггүй
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return addresses;
}

export default function QrPage() {
  const t = useT();
  const toast = useToast();
  const { exam, token, loading, error } = useTeacherExam();

  const [slides, setSlides] = useState<string[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const qrRef = useRef<QrCanvasHandle>(null);
  const lanAddresses = useLanAddresses();

  // -------------------------------------------------------------------------
  // QR-ын агуулгыг горимоос хамааруулан бэлдэнэ
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!exam) return;
    let cancelled = false;

    const build = async () => {
      setBuildError(null);

      if (exam.deliveryMode === 'offlineQr') {
        try {
          const chunkId = shortId(6);
          const result = await buildOfflineExamSlides(exam, exam.mode, chunkId);
          if (cancelled) return;
          setSlides(result.slides);
          setSlideIndex(0);
          // Сурагчийн дүнг тайлахад хэрэгтэй түлхүүрийг локалд хадгална
          await db.exams.update(exam.id, { secretKey: result.secretKey });
        } catch (cause) {
          if (cancelled) return;
          setBuildError(cause instanceof Error ? cause.message : String(cause));
          setSlides([]);
        }
        return;
      }

      // online / lan — QR нь зөвхөн хаяг заана, горим солиход ӨӨРЧЛӨГДӨХГҮЙ
      const base = config.publicAppUrl;
      setSlides([`${base}/exam/${exam.id}`]);
      setSlideIndex(0);
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, [exam]);

  // -------------------------------------------------------------------------
  // Автомат слайд солилт
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (slides.length <= 1 || !playing) return;
    const timer = setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [slides.length, playing]);

  // -------------------------------------------------------------------------
  // Бүтэн дэлгэц
  // -------------------------------------------------------------------------
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Зарим браузер зөвшөөрөхгүй байж болно — UI төлвөө л сольж үзүүлнэ
      setFullscreen((current) => !current);
    }
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Гарын товчлуур
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setSlideIndex((i) => (i + 1) % Math.max(1, slides.length));
      if (event.key === 'ArrowLeft')
        setSlideIndex((i) => (i - 1 + Math.max(1, slides.length)) % Math.max(1, slides.length));
      if (event.key === ' ') {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slides.length]);

  const currentSlide = slides[slideIndex] ?? '';
  const modeLabel = exam?.mode === 'post' ? t('exam.mode.post') : t('exam.mode.pre');

  const tooManyQuestions = useMemo(
    () => exam?.deliveryMode === 'offlineQr' && exam.questions.length > QR_QUESTION_WARN_THRESHOLD,
    [exam],
  );

  const downloadPng = () => {
    const dataUrl = qrRef.current?.toDataUrl();
    if (!dataUrl || !exam) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${safeFileName(exam.title, 'shalgalt')}-qr-${slideIndex + 1}.png`;
    link.click();
  };

  if (loading)
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );

  if (error || !exam) {
    return (
      <AppLayout>
        <ErrorState
          title={t('error.examNotFound')}
          message={error === 'network' ? t('error.network') : undefined}
          action={
            <Button asChild>
              <Link to="/">{t('nav.home')}</Link>
            </Button>
          }
        />
      </AppLayout>
    );
  }

  const qrSize = fullscreen ? 520 : 320;

  return (
    <AppLayout
      title={fullscreen ? undefined : t('qr.title')}
      actions={
        !fullscreen && token ? (
          <Button asChild variant="ghost" className="text-white hover:bg-white/15">
            <Link to={`/teacher/${exam.id}?t=${encodeURIComponent(token)}`}>
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('teacher.dashboard')}</span>
            </Link>
          </Button>
        ) : undefined
      }
      wide={fullscreen}
    >
      {/*
        ⚠ Хамгийн түгээмэл алдаа: багш `localhost` хаягаар нээсэн бол QR дотор
        `http://localhost:…` бичигдэж, утас өөрийнхөө localhost руу ханддаг тул
        нээгдэхгүй. Багшид зөв хаягийг шууд санал болгоно.
      */}
      {config.publicUrlIsLoopback && exam.deliveryMode !== 'offlineQr' && (
        <Alert tone="danger" title={t('qr.localhostTitle')}>
          <p className="mt-1">{t('qr.localhostBody')}</p>

          {lanAddresses.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium">{t('qr.openInstead')}</p>
              {lanAddresses.map((address) => {
                const target = `http://${address}:${window.location.port || '80'}${window.location.pathname}${window.location.search}`;
                return (
                  <a
                    key={address}
                    href={target}
                    className="flex min-h-touch items-center justify-between gap-2 rounded-xl border border-danger-100 bg-white px-3 py-2 font-mono text-sm text-primary hover:bg-primary-50"
                  >
                    <span className="truncate">
                      http://{address}:{window.location.port || '80'}
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs">{t('qr.localhostManual')}</p>
          )}
        </Alert>
      )}

      {buildError && (
        <Alert tone="danger" title={t('error.qrTooLarge')}>
          {buildError}
        </Alert>
      )}

      {tooManyQuestions && (
        <Alert tone="warning">
          {t('qr.tooManyQuestions', {
            count: exam.questions.length,
            slides: slides.length,
          })}
        </Alert>
      )}

      <Card className={cn('mt-4', fullscreen && 'border-0 shadow-none')}>
        <CardBody className="flex flex-col items-center gap-4 py-8">
          {/* QR */}
          <div className="rounded-2xl bg-white p-4 shadow-soft">
            {currentSlide === '' ? (
              <div
                className="skeleton"
                style={{ width: qrSize, height: qrSize }}
                aria-label={t('common.loading')}
              />
            ) : (
              <QrCanvas
                ref={qrRef}
                value={currentSlide}
                size={qrSize}
                alt={`${exam.title} — QR`}
                onError={(message) => toast.error(message)}
              />
            )}
          </div>

          {/* Слайдын навигаци */}
          {slides.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSlideIndex((i) => (i - 1 + slides.length) % slides.length)}
                aria-label={t('common.previous')}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </Button>

              <Badge tone="primary" className="px-3 py-1.5 text-sm">
                {t('qr.slide', { current: slideIndex + 1, total: slides.length })}
              </Badge>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSlideIndex((i) => (i + 1) % slides.length)}
                aria-label={t('common.next')}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPlaying((value) => !value)}
                aria-label={playing ? t('qr.pause') : t('qr.play')}
              >
                {playing ? (
                  <Pause className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Play className="h-5 w-5" aria-hidden="true" />
                )}
              </Button>
            </div>
          )}

          {/* Шалгалтын мэдээлэл — проекторт харагдахуйц том */}
          <div className="text-center">
            <p className={cn('font-bold text-slate-900', fullscreen ? 'text-4xl' : 'text-2xl')}>
              {exam.title}
            </p>
            <p className={cn('mt-1 text-slate-600', fullscreen ? 'text-2xl' : 'text-base')}>
              {exam.subject} · {exam.teacherName}
            </p>
            <p
              className="mt-4 font-extrabold tracking-wide text-primary"
              style={{ fontSize: fullscreen ? '72px' : '48px', lineHeight: 1.1 }}
            >
              {modeLabel}
            </p>
          </div>

          {!fullscreen && (
            <div className="text-center">
              <p className="text-sm text-slate-500">{t('qr.scanHint')}</p>
              {exam.deliveryMode !== 'offlineQr' && (
                <p className="mt-1 text-xs text-slate-400">{t('qr.sameWifi')}</p>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Үйлдлүүд */}
      <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => void toggleFullscreen()}>
          {fullscreen ? (
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          )}
          {fullscreen ? t('qr.exitFullscreen') : t('qr.fullscreen')}
        </Button>

        <Button variant="secondary" onClick={downloadPng}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t('qr.downloadPng')}
        </Button>

        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {t('common.print')}
        </Button>

        {exam.deliveryMode !== 'offlineQr' && (
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await copyToClipboard(currentSlide);
              if (ok) toast.success(t('common.copied'));
            }}
          >
            {t('qr.link')}
          </Button>
        )}
      </div>

      {exam.deliveryMode !== 'offlineQr' && (
        <p className="mt-3 break-all text-center text-xs text-slate-400">{currentSlide}</p>
      )}

      {/* Хэвлэхэд бүх слайд гарна */}
      <div className="print-only">
        {slides.map((slide, index) => (
          <div key={slide} className="print-page flex flex-col items-center gap-4 py-8">
            <QrCanvas value={slide} size={360} alt={`QR ${index + 1}`} />
            <p className="text-2xl font-bold">{exam.title}</p>
            <p className="text-lg">
              {exam.subject} · {exam.teacherName}
            </p>
            <p className="text-5xl font-extrabold">{modeLabel}</p>
            {slides.length > 1 && (
              <p className="text-lg">
                {t('qr.slide', { current: index + 1, total: slides.length })}
              </p>
            )}
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
