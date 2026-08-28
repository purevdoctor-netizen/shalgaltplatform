/**
 * Админы хуудас — багш нарын данс нээх, идэвхгүй болгох, нууц үг сэргээх.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type { User, UserRole } from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  EmptyState,
  ErrorState,
  FieldError,
  FieldHint,
  Input,
  Label,
  LoadingState,
  Select,
} from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useT } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { copyToClipboard, formatDateTime } from '../../lib/utils';

interface Overview {
  teachers: number;
  admins: number;
  inactive: number;
  exams: number;
  submissions: number;
}

export default function AdminUsersPage() {
  const t = useT();
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Данс нээх маягт
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * ⚠ ГАНЦ харилцах цонх, хоёр үе шат.
   *
   * Хоёр тусдаа Radix Dialog ашиглаж, нэгийг хааж нөгөөг нь ЯГ ТЭР АГШИНД
   * нээвэл `<body>`-гийн `pointer-events: none` цэвэрлэгээ буруу дараалалд
   * ажиллаж, бүх хуудас дарагдахаа болино. Тиймээс нэг цонхны агуулгыг
   * л сольж харуулна.
   */
  const [dialog, setDialog] = useState<
    | { kind: 'none' }
    | { kind: 'form' }
    | { kind: 'credential'; username: string; password: string; isReset: boolean }
  >({ kind: 'none' });

  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userList, stats] = await Promise.all([api.listUsers(), api.adminOverview()]);
      setUsers(userList.users);
      setOverview(stats);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.isOffline
            ? t('error.network')
            : cause.message
          : t('common.unknownError'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // -------------------------------------------------------------------------
  const resetForm = () => {
    setUsername('');
    setFullName('');
    setEmail('');
    setRole('teacher');
    setFormError(null);
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      const result = await api.createUser({
        username: username.trim(),
        fullName: fullName.trim(),
        role,
        ...(email.trim() !== '' ? { email: email.trim() } : {}),
      });

      // Цонхыг ХААХГҮЙ — ижил цонхны агуулгыг нууц үг рүү сольно
      setDialog({
        kind: 'credential',
        username: result.user.username,
        password: result.tempPassword ?? '',
        isReset: false,
      });
      resetForm();
      await load();
      toast.success(t('admin.created', { name: result.user.fullName }));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : t('common.unknownError'));
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (target: User) => {
    try {
      await api.updateUser(target.id, { isActive: !target.isActive });
      await load();
      toast.success(target.isActive ? t('admin.disabled') : t('admin.enabled'));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('common.unknownError'));
    }
  };

  const resetUserPassword = async (target: User) => {
    try {
      const result = await api.resetUserPassword(target.id);
      setDialog({
        kind: 'credential',
        username: target.username,
        password: result.tempPassword,
        isReset: true,
      });
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('common.unknownError'));
    }
  };

  const removeUser = async (target: User) => {
    try {
      await api.deleteUser(target.id);
      setConfirmDelete(null);
      await load();
      toast.success(t('admin.deleted'));
    } catch (cause) {
      setConfirmDelete(null);
      toast.error(cause instanceof Error ? cause.message : t('common.unknownError'));
    }
  };

  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <AppLayout title={t('admin.title')}>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title={t('admin.title')}>
        <ErrorState
          title={t('common.error')}
          message={error}
          action={<Button onClick={() => void load()}>{t('common.retry')}</Button>}
        />
      </AppLayout>
    );
  }

  const admins = users.filter((item) => item.role === 'admin');
  const teachers = users.filter((item) => item.role === 'teacher');

  return (
    <AppLayout title={t('admin.title')} subtitle={t('admin.subtitle')} wide>
      <div className="space-y-5">
        {/* Тойм */}
        {overview && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label={t('admin.stat.teachers')} value={overview.teachers} />
            <Stat label={t('admin.stat.admins')} value={overview.admins} />
            <Stat label={t('admin.stat.inactive')} value={overview.inactive} />
            <Stat label={t('admin.stat.exams')} value={overview.exams} />
            <Stat label={t('admin.stat.submissions')} value={overview.submissions} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            onClick={() => {
              resetForm();
              setDialog({ kind: 'form' });
            }}
          >
            <UserPlus className="h-5 w-5" aria-hidden="true" />
            {t('admin.newAccount')}
          </Button>
          <Button variant="ghost" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('common.retry')}
          </Button>
        </div>

        <SmtpCard />

        <UserTable
          title={t('admin.teachers')}
          users={teachers}
          currentUserId={currentUser?.id ?? ''}
          onToggle={toggleActive}
          onReset={resetUserPassword}
          onDelete={setConfirmDelete}
          emptyText={t('admin.noTeachers')}
        />

        <UserTable
          title={t('admin.admins')}
          users={admins}
          currentUserId={currentUser?.id ?? ''}
          onToggle={toggleActive}
          onReset={resetUserPassword}
          onDelete={setConfirmDelete}
          emptyText={t('common.empty')}
        />
      </div>

      {/* ---------------------------------------------------------------
          ГАНЦ цонх, хоёр үе шат: маягт → түр нууц үг
          (хоёр Dialog давхарлавал Radix-ийн pointer-events цэвэрлэгээ
          эвдэрч бүх хуудас дарагдахаа больдог)
      --------------------------------------------------------------- */}
      <Dialog
        open={dialog.kind !== 'none'}
        onOpenChange={(open) => {
          if (!open) {
            setDialog({ kind: 'none' });
            resetForm();
          }
        }}
        title={dialog.kind === 'credential' ? t('admin.credentialTitle') : t('admin.newAccount')}
        description={dialog.kind === 'form' ? t('admin.newAccountHint') : undefined}
      >
        {dialog.kind === 'form' && (
          <form onSubmit={createAccount} className="space-y-4">
            <div>
              <Label htmlFor="new-username" required>
                {t('auth.username')}
              </Label>
              <Input
                id="new-username"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                placeholder="bagsh.ganbat"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={60}
                required
              />
              <FieldHint>{t('admin.usernameHint')}</FieldHint>
            </div>

            <div>
              <Label htmlFor="new-fullname" required>
                {t('admin.fullName')}
              </Label>
              <Input
                id="new-fullname"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Г.Ганбат"
                maxLength={200}
                required
              />
            </div>

            <div>
              <Label htmlFor="new-email">{t('exam.teacherEmail')}</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={320}
              />
              <FieldHint>{t('admin.emailHint')}</FieldHint>
            </div>

            <div>
              <Label htmlFor="new-role">{t('admin.role')}</Label>
              <Select
                id="new-role"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                <option value="teacher">{t('admin.role.teacher')}</option>
                <option value="admin">{t('admin.role.admin')}</option>
              </Select>
            </div>

            {formError && <FieldError>{formError}</FieldError>}

            <Alert tone="primary">{t('admin.tempPasswordNote')}</Alert>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDialog({ kind: 'none' });
                  resetForm();
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={creating || username.trim() === '' || fullName.trim() === ''}
              >
                {creating ? t('common.saving') : t('admin.create')}
              </Button>
            </div>
          </form>
        )}

        {dialog.kind === 'credential' && (
          <div className="space-y-3">
            <Alert tone="warning">{t('admin.credentialWarning')}</Alert>

            <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {t('auth.username')}
                </p>
                <p className="select-all font-mono text-lg font-semibold">{dialog.username}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {t('auth.tempPassword')}
                </p>
                <p className="select-all break-all font-mono text-2xl font-bold tracking-wide text-primary">
                  {dialog.password}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              block
              onClick={async () => {
                const text = `${t('auth.username')}: ${dialog.username}\n${t('auth.tempPassword')}: ${dialog.password}`;
                if (await copyToClipboard(text)) toast.success(t('common.copied'));
              }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {t('common.copy')}
            </Button>

            <FieldHint>{t('admin.credentialHint')}</FieldHint>

            <Button block onClick={() => setDialog({ kind: 'none' })}>
              {t('admin.credentialSaved')}
            </Button>
          </div>
        )}
      </Dialog>

      {/* --- Устгах баталгаа --- */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={t('admin.deleteTitle')}
        description={
          confirmDelete ? t('admin.deleteBody', { name: confirmDelete.fullName }) : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmDelete && void removeUser(confirmDelete)}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <Alert tone="warning">{t('admin.deleteHint')}</Alert>
      </Dialog>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------

/**
 * Имэйлийн (SMTP) тохиргооны төлөв.
 *
 * Багш "Имэйлээр илгээх" дарахад алдаа гарвал шалтгаан нь бараг үргэлж
 * SMTP тохируулаагүй байдаг. Админ энд шууд шалгаж, туршилтын захиа илгээнэ.
 */
function SmtpCard() {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<{
    ok: boolean;
    configured: boolean;
    message: string;
    settings: { host: string; port: number; secure: boolean; user: string; from: string };
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await api.smtpStatus());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('common.unknownError'));
    } finally {
      setChecking(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void check();
  }, [check]);

  const sendTest = async () => {
    setTesting(true);
    try {
      const result = await api.smtpTest();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await check();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('common.unknownError'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4" aria-hidden="true" />
            {t('admin.smtp')}
            {status && (
              <Badge tone={status.ok ? 'success' : status.configured ? 'danger' : 'warning'}>
                {status.ok
                  ? t('admin.smtpOk')
                  : status.configured
                    ? t('admin.smtpError')
                    : t('admin.smtpNotSet')}
              </Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {checking && !status ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : status ? (
          <>
            <Alert tone={status.ok ? 'success' : status.configured ? 'danger' : 'warning'}>
              {status.message}
            </Alert>

            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-slate-500">SMTP_HOST</dt>
                <dd className="font-mono">{status.settings.host || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">SMTP_PORT</dt>
                <dd className="font-mono">{status.settings.port}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">SMTP_SECURE</dt>
                <dd className="font-mono">{String(status.settings.secure)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">SMTP_USER</dt>
                <dd className="truncate font-mono">{status.settings.user || '—'}</dd>
              </div>
            </dl>

            {!status.configured && <FieldHint>{t('admin.smtpSetupHint')}</FieldHint>}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking}>
                <RefreshCw
                  className={checking ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                  aria-hidden="true"
                />
                {t('admin.smtpCheck')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void sendTest()}
                disabled={testing || !status.configured}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {testing ? t('report.sending') : t('admin.smtpTest')}
              </Button>
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function UserTable({
  title,
  users,
  currentUserId,
  onToggle,
  onReset,
  onDelete,
  emptyText,
}: {
  title: string;
  users: User[];
  currentUserId: string;
  onToggle: (user: User) => void | Promise<void>;
  onReset: (user: User) => void | Promise<void>;
  onDelete: (user: User) => void;
  emptyText: string;
}) {
  const t = useT();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} <span className="font-normal text-slate-500">({users.length})</span>
        </CardTitle>
      </CardHeader>
      <CardBody>
        {users.length === 0 ? (
          <EmptyState icon={<Users className="h-10 w-10" aria-hidden="true" />} title={emptyText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">{t('admin.fullName')}</th>
                  <th className="py-2 pr-3">{t('auth.username')}</th>
                  <th className="py-2 pr-3">{t('exam.teacherEmail')}</th>
                  <th className="py-2 pr-3 text-center">{t('admin.examCount')}</th>
                  <th className="py-2 pr-3">{t('admin.lastLogin')}</th>
                  <th className="py-2 pr-3">{t('admin.status')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {item.fullName}
                      {item.id === currentUserId && (
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          ({t('admin.you')})
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{item.username}</td>
                    <td className="py-2 pr-3 text-slate-600">{item.email ?? '—'}</td>
                    <td className="py-2 pr-3 text-center tabular-nums">{item.examCount ?? 0}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {item.lastLoginAt
                        ? formatDateTime(item.lastLoginAt)
                        : t('admin.neverLoggedIn')}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={item.isActive ? 'success' : 'neutral'}>
                          {item.isActive ? t('admin.active') : t('admin.inactive')}
                        </Badge>
                        {item.mustChangePassword && (
                          <Badge tone="warning">{t('admin.pendingPassword')}</Badge>
                        )}
                        {item.role === 'admin' && (
                          <Badge tone="primary">
                            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                            {t('admin.role.admin')}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void onReset(item)}
                          title={t('admin.resetPassword')}
                        >
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void onToggle(item)}
                          disabled={item.id === currentUserId}
                          title={item.isActive ? t('admin.disable') : t('admin.enable')}
                        >
                          {item.isActive ? t('admin.disable') : t('admin.enable')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(item)}
                          disabled={item.id === currentUserId || (item.examCount ?? 0) > 0}
                          title={t('common.delete')}
                          className="text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
