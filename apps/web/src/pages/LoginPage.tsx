/**
 * Нэвтрэх хуудас.
 *
 * Систем дээр админ огт байхгүй бол (эхний суулгалт) заавар харуулна.
 */

import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, LogIn, Terminal } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
  LoadingState,
} from '../components/ui';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, needsSetup, login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.isOffline
            ? t('error.network')
            : cause.message
          : t('common.unknownError'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout title={t('auth.login')} subtitle={t('app.tagline')}>
      <div className="mx-auto max-w-md space-y-4">
        {needsSetup && (
          <Alert tone="warning" title={t('auth.setupTitle')}>
            <p className="mt-1">{t('auth.setupBody')}</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">
              <code>pnpm --filter @shalgalt/api admin:create</code>
            </pre>
            <p className="mt-2 flex items-center gap-1.5 text-xs">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              {t('auth.setupHint')}
            </p>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.login')}</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="username" required>
                  {t('auth.username')}
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={60}
                  required
                />
              </div>

              <div>
                <Label htmlFor="password" required>
                  {t('auth.password')}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  maxLength={200}
                  required
                />
              </div>

              {error && <FieldError>{error}</FieldError>}

              <Button
                type="submit"
                size="lg"
                block
                disabled={busy || username.trim() === '' || password === ''}
              >
                <LogIn className="h-5 w-5" aria-hidden="true" />
                {busy ? t('auth.loggingIn') : t('auth.login')}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Alert tone="primary">
          <span className="flex items-start gap-2">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('auth.forgotPassword')}
          </span>
        </Alert>
      </div>
    </AppLayout>
  );
}
