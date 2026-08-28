/**
 * `offlineQr` горимын нэвтрэх цэг: `/x?d=<payload>` эсвэл
 * `/x?v=1&id=<chunkId>&i=<i>&n=<n>&c=<хэсэг>`.
 *
 * Хэсэглэсэн QR-ыг IndexedDB-д хуримтлуулж, бүгд цуглахад нэгтгэнэ.
 * Дутуу үед "2/3 хүлээж байна" гэж харуулна.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, QrCode } from 'lucide-react';
import { missingChunkIndices, reassembleChunks, type QrChunk } from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  Alert,
  Button,
  Card,
  CardBody,
  ErrorState,
  LoadingState,
  Progress,
} from '../../components/ui';
import { useT } from '../../i18n';
import { clearQrChunks, listQrChunks, saveExamLocally, saveQrChunk } from '../../db';
import { decodeOfflineExam } from '../../lib/offlineQr';

type Phase = 'loading' | 'waiting' | 'error';

export default function OfflineEntryPage() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ received: number; total: number; missing: number[] }>({
    received: 0,
    total: 0,
    missing: [],
  });

  const openExam = useCallback(
    async (encoded: string) => {
      const { exam } = await decodeOfflineExam(encoded);
      await saveExamLocally(exam, { ownedByMe: false });
      navigate(`/exam/${exam.id}`, { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // --- 1. Бүтэн payload ---
        const full = searchParams.get('d');
        if (full && full !== '') {
          await openExam(full);
          return;
        }

        // --- 2. Хэсэглэсэн QR ---
        const chunkId = searchParams.get('id');
        const rawIndex = Number(searchParams.get('i'));
        const rawTotal = Number(searchParams.get('n'));
        const data = searchParams.get('c');

        if (
          !chunkId ||
          !data ||
          !Number.isInteger(rawIndex) ||
          !Number.isInteger(rawTotal) ||
          rawIndex < 1 ||
          rawTotal < 1 ||
          rawIndex > rawTotal
        ) {
          if (!cancelled) {
            setPhase('error');
            setMessage(t('collect.invalid'));
          }
          return;
        }

        await saveQrChunk({ chunkId, index: rawIndex, total: rawTotal, data });

        const stored = await listQrChunks(chunkId);
        const chunks: QrChunk[] = stored.map((row) => ({
          v: 1,
          id: row.chunkId,
          i: row.index,
          n: row.total,
          c: row.data,
        }));

        const missing = missingChunkIndices(chunks);
        if (cancelled) return;

        if (missing.length === 0) {
          const encoded = reassembleChunks(chunks);
          await clearQrChunks(chunkId);
          await openExam(encoded);
          return;
        }

        setProgress({ received: chunks.length, total: rawTotal, missing });
        setPhase('waiting');
      } catch (cause) {
        if (cancelled) return;
        setPhase('error');
        setMessage(cause instanceof Error ? cause.message : String(cause));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openExam, searchParams, t]);

  if (phase === 'loading') {
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (phase === 'error') {
    return (
      <AppLayout>
        <ErrorState
          title={t('collect.invalid')}
          message={message ?? undefined}
          action={
            <Button asChild>
              <Link to="/">{t('nav.home')}</Link>
            </Button>
          }
        />
      </AppLayout>
    );
  }

  // Дутуу хэсэг хүлээж байна
  return (
    <AppLayout title={t('qr.title')}>
      <div className="mx-auto max-w-md">
        <Card>
          <CardBody className="space-y-4 text-center">
            <QrCode className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />

            <p className="text-lg font-semibold text-slate-900">
              {t('collect.chunkProgress', {
                received: progress.received,
                total: progress.total,
              })}
            </p>

            <Progress
              value={progress.received}
              max={progress.total}
              label={t('collect.chunkProgress', {
                received: progress.received,
                total: progress.total,
              })}
            />

            <ul className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: progress.total }, (_, index) => index + 1).map((slot) => {
                const received = !progress.missing.includes(slot);
                return (
                  <li
                    key={slot}
                    className={
                      received
                        ? 'flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 font-semibold text-success-700'
                        : 'flex h-10 w-10 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 font-semibold text-slate-400'
                    }
                  >
                    {received ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : slot}
                  </li>
                );
              })}
            </ul>

            <Alert tone="primary">{t('qr.scanHint')}</Alert>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
