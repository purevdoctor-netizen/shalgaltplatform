/**
 * Router.
 *
 * `BrowserRouter` ашиглана — даалгаварт заасан `https://<domain>/exam/<examId>`
 * хэлбэрийн цэвэр зам хэрэгтэй.
 *
 * `offlineQr` горимын QR нь `<app-url>/#/x?d=<payload>` хэлбэртэй (hash хэсэг нь
 * серверт хүрдэггүй тул урт payload дамжуулахад тохиромжтой). Үүнийг
 * `normalizeOfflineHash()` нь ачаалахын өмнө `/x?...` зам болгож хөрвүүлнэ.
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoadingState } from './components/ui';
import { RequireAdmin, RequireAuth } from './components/layout/RouteGuards';
import { useT } from './i18n';

const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/UsersPage'));
const CreateExamPage = lazy(() => import('./pages/teacher/CreateExamPage'));
const QrPage = lazy(() => import('./pages/teacher/QrPage'));
const DashboardPage = lazy(() => import('./pages/teacher/DashboardPage'));
const CollectPage = lazy(() => import('./pages/teacher/CollectPage'));
const ReportPage = lazy(() => import('./pages/teacher/ReportPage'));
const StudentEntryPage = lazy(() => import('./pages/student/StudentEntryPage'));
const ExamPage = lazy(() => import('./pages/student/ExamPage'));
const ResultPage = lazy(() => import('./pages/student/ResultPage'));
const OfflineEntryPage = lazy(() => import('./pages/student/OfflineEntryPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

/**
 * `…/#/x?d=…` → `…/x?d=…`
 * Апп ачаалахаас өмнө `main.tsx`-ээс дуудагдана.
 */
export function normalizeOfflineHash(): void {
  const hash = window.location.hash;
  if (!hash.startsWith('#/x')) return;

  const query = hash.slice('#/x'.length).replace(/^\?/, '');
  const target =
    `${window.location.pathname.replace(/\/+$/, '')}/x${query ? `?${query}` : ''}`.replace(
      /\/{2,}/g,
      '/',
    );

  window.history.replaceState(null, '', target);
}

function RouteFallback() {
  const t = useT();
  return <LoadingState label={t('common.loading')} />;
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Нэвтэрсэн байх шаардлагатай */}
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/create" element={<CreateExamPage />} />
            <Route path="/teacher/:examId" element={<DashboardPage />} />
            <Route path="/teacher/:examId/qr" element={<QrPage />} />
            <Route path="/teacher/:examId/collect" element={<CollectPage />} />
            <Route path="/teacher/:examId/report" element={<ReportPage />} />
          </Route>

          {/* Зөвхөн админ */}
          <Route element={<RequireAdmin />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>

          {/* Сурагч */}
          <Route path="/exam/:examId" element={<StudentEntryPage />} />
          <Route path="/exam/:examId/take" element={<ExamPage />} />
          <Route path="/exam/:examId/result" element={<ResultPage />} />

          {/* offlineQr горимын нэвтрэх цэг */}
          <Route path="/x" element={<OfflineEntryPage />} />

          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
