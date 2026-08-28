/**
 * Замын хамгаалалт.
 *
 * `RequireAuth`  — нэвтэрсэн байхыг шаардана; түр нууц үгтэй бол солих хуудас руу
 * `RequireAdmin` — админ эрхийг шаардана
 *
 * ⚠ Сурагчийн замууд (`/exam/…`, `/x`) хамгаалагдахгүй — нэвтрэлт шаардахгүй,
 * офлайн ажиллана.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { Button, ErrorState, LoadingState } from '../ui';
import { useT } from '../../i18n';
import { useAuth } from '../../lib/auth';

export function RequireAuth() {
  const t = useT();
  const location = useLocation();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // Түр нууц үгтэй хэрэглэгчийг эхлээд солиулна
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

export function RequireAdmin() {
  const t = useT();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== 'admin') {
    return (
      <AppLayout>
        <ErrorState
          title={t('auth.adminOnly')}
          action={
            <Button asChild>
              <a href="/">{t('nav.home')}</a>
            </Button>
          }
        />
      </AppLayout>
    );
  }

  return <Outlet />;
}
