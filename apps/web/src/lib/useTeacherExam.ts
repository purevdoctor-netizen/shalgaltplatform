/**
 * Багшийн шалгалтыг ачаална: сүлжээнээс, боломжгүй бол локал IndexedDB-ээс.
 * Токеныг URL (`?t=`) эсвэл локал сангаас олно.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { Exam } from '@shalgalt/shared';
import { api, ApiError } from './api';
import { db, getExamLocally, saveExamLocally } from '../db';

export interface TeacherExamState {
  examId: string;
  token: string | null;
  exam: Exam | null;
  counts: { pre: number; post: number } | null;
  loading: boolean;
  error: string | null;
  /** Локал хуулбараас уншсан эсэх (офлайн). */
  fromCache: boolean;
  reload: () => Promise<void>;
  setExam: (exam: Exam) => void;
}

function validToken(value: string | null | undefined): string | null {
  const token = value?.trim();
  return token && token !== 'undefined' && token !== 'null' ? token : null;
}

export function useTeacherExam(): TeacherExamState {
  const { examId = '' } = useParams<{ examId: string }>();
  const [searchParams] = useSearchParams();

  const [token, setToken] = useState<string | null>(validToken(searchParams.get('t')));
  const [exam, setExamState] = useState<Exam | null>(null);
  const [counts, setCounts] = useState<{ pre: number; post: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    if (examId === '') {
      setError('examId');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Токеныг URL-аас, эс бөгөөс локал сангаас
    const urlToken = validToken(searchParams.get('t'));
    const stored = await db.exams.get(examId);
    const storedToken = validToken(stored?.teacherToken);
    const activeToken = urlToken ?? storedToken;
    setToken(activeToken);

    // 2. Сүлжээнээс оролдоно
    try {
      const response = await api.getExam(examId, activeToken ?? undefined);

      // GET endpoint буруу токентой үед сурагчийн хувилбарыг 200 буцаадаг.
      // Багшийн хуудсанд үүнийг амжилттай нэвтэрсэн гэж үзэж болохгүй.
      if (activeToken && !response.isTeacher) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Багшийн токен буруу байна.', response);
      }

      setExamState(response.exam);
      setCounts(response.counts ?? null);
      setFromCache(false);

      if (response.isTeacher) {
        await saveExamLocally(response.exam, { ownedByMe: true });
      }
      setLoading(false);
      return;
    } catch (cause) {
      // Хуучин bookmark/link-ийн токен локалд хадгалсан шинэ токеноос зөрсөн
      // бол зөвхөн локал токеноор нэг удаа дахин оролдоно.
      if (urlToken && storedToken && storedToken !== urlToken) {
        try {
          const response = await api.getExam(examId, storedToken);
          if (!response.isTeacher) throw new Error('Stored teacher token is invalid');
          setToken(storedToken);
          setExamState(response.exam);
          setCounts(response.counts ?? null);
          setFromCache(false);
          if (response.isTeacher) {
            await saveExamLocally(response.exam, { ownedByMe: true });
          }
          setLoading(false);
          return;
        } catch {
          // Доорх локал cache/error fallback үргэлжилнэ.
        }
      }

      // 3. Офлайн эсвэл сервер алдаа — локал хуулбар руу шилжинэ
      const local = await getExamLocally(examId);
      if (local) {
        setExamState(local);
        setToken(local.teacherToken ?? activeToken);
        setFromCache(true);
        setLoading(false);
        return;
      }
      setError(
        cause instanceof ApiError
          ? cause.isOffline
            ? 'network'
            : cause.isNotFound
              ? 'notFound'
              : cause.message
          : 'unknown',
      );
      setLoading(false);
    }
  }, [examId, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const setExam = useCallback((next: Exam) => {
    setExamState(next);
    void saveExamLocally(next, { ownedByMe: true });
  }, []);

  return {
    examId,
    token,
    exam,
    counts,
    loading,
    error,
    fromCache,
    reload: load,
    setExam,
  };
}
