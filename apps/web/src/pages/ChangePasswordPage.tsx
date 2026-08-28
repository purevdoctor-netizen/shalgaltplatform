/**
 * Нууц үг солих.
 *
 * Админаас түр нууц үг авсан хэрэглэгч эхний нэвтрэлтэд ЗААВАЛ энд орно.
 */

import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  FieldError,
  FieldHint,
  Input,
  Label,
} from '../components/ui';
import { useToast } from '../components/ui/toast';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

const MIN_LENGTH = 8;

export default function ChangePasswordPage() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, loading, mustChangePassword, changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && !user) return <Navigate to="/login" replace />;

  const tooShort = next !== '' && next.length < MIN_LENGTH;
  const mismatch = confirm !== '' && next !== confirm;
  const invalid =
    current === '' || next.length < MIN_LENGTH || next !== confirm || next === current;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success(t('auth.passwordChanged'));
      navigate('/', { replace: true });
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
    <AppLayout title={t('auth.changePassword')}>
      <div className="mx-auto max-w-md space-y-4">
        {mustChangePassword && (
          <Alert tone="warning" title={t('auth.mustChangeTitle')}>
            {t('auth.mustChangeBody')}
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.changePassword')}</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="current" required>
                  {t('auth.currentPassword')}
                </Label>
                <Input
                  id="current"
                  type="password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div>
                <Label htmlFor="next" required>
                  {t('auth.newPassword')}
                </Label>
                <Input
                  id="next"
                  type="password"
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  autoComplete="new-password"
                  aria-invalid={tooShort}
                  required
                />
                <FieldHint>{t('auth.passwordRule', { min: MIN_LENGTH })}</FieldHint>
                <FieldError>
                  {tooShort ? t('auth.passwordTooShort', { min: MIN_LENGTH }) : undefined}
                </FieldError>
              </div>

              <div>
                <Label htmlFor="confirm" required>
                  {t('auth.confirmPassword')}
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  aria-invalid={mismatch}
                  required
                />
                <FieldError>{mismatch ? t('auth.passwordMismatch') : undefined}</FieldError>
              </div>

              {error && <FieldError>{error}</FieldError>}

              <Button type="submit" size="lg" block disabled={busy || invalid}>
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                {busy ? t('common.saving') : t('auth.changePassword')}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
