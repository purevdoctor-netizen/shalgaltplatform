/**
 * Сурагчийн талын шалгалт ачаалагч.
 *
 * Дараалал: локал IndexedDB (офлайн бэлэн) → сервер. `offlineQr` горимд
 * шалгалт зөвхөн локалд байдаг (QR-аас задарсан).
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Exam } from '@shalgalt/shared';
import { api, ApiError } from './api';
import { getExamLocally, saveExamLocally } from '../db';

export interface StudentExamState {
  examId: string;
  exam: Exam | null;
  loading: boolean;
  error: 'notFound' | 'network' | 'unknown' | null;
  fromCache: boolean;
  reload: () => Promise<void>;
}

export function useStudentExam(explicitExamId?: string): StudentExamState {
  const params = useParams<{ examId: string }>();
  const examId = explicitExamId ?? params.examId ?? '';

  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<StudentExamState['error']>(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    if (examId === '') {
      setError('notFound');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const local = await getExamLocally(examId);

    // offlineQr горимд сервер байхгүй — локал хуулбар л байна
    if (local?.deliveryMode === 'offlineQr') {
      setExam(local);
      setFromCache(true);
      setLoading(false);
      return;
    }

    try {
      const response = await api.getExam(examId);
      setExam(response.exam);
      setFromCache(false);
      // Офлайн болоход үргэлжлүүлэх боломжтой байхаар хадгална
      await saveExamLocally(response.exam);
    } catch (cause) {
      if (local) {
        setExam(local);
        setFromCache(true);
      } else {
        setError(
          cause instanceof ApiError
            ? cause.isNotFound
              ? 'notFound'
              : cause.isOffline
                ? 'network'
                : 'unknown'
            : 'unknown',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { examId, exam, loading, error, fromCache, reload: load };
}
