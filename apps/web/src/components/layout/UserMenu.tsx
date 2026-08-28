/**
 * Толгой хэсгийн хэрэглэгчийн цэс — нэр, эрх, нууц үг солих, гарах.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { KeyRound, LogIn, LogOut, ShieldCheck, UserCircle2, Users } from 'lucide-react';
import { useT } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

const ITEM_CLASS = cn(
  'flex min-h-touch cursor-pointer select-none items-center gap-2 rounded-xl px-3 text-sm',
  'text-slate-700 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900',
);

export function UserMenu() {
  const t = useT();
  const navigate = useNavigate();
  const { user, loading, offline, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  // Офлайн үед сервер хүрэхгүй тул нэвтрэлтийн товч харуулахгүй
  // (сурагчийн урсгалд саад болохгүй).
  if (loading || offline) return null;

  if (!user) {
    return (
      <Button asChild variant="ghost" className="text-white hover:bg-white/15">
        <Link to="/login">
          <LogIn className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('auth.login')}</span>
        </Link>
      </Button>
    );
  }

  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-touch items-center gap-2 rounded-xl px-2 text-white transition-colors',
            'hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
          )}
          aria-label={user.fullName}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
            {initials || <UserCircle2 className="h-5 w-5" aria-hidden="true" />}
          </span>
          <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
            {user.fullName}
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[15rem] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-soft-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate font-medium text-slate-900">{user.fullName}</p>
            <p className="truncate font-mono text-xs text-slate-500">{user.username}</p>
            {user.role === 'admin' && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                {t('admin.role.admin')}
              </span>
            )}
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />

          {user.role === 'admin' && (
            <DropdownMenu.Item asChild>
              <Link to="/admin/users" className={ITEM_CLASS}>
                <Users className="h-4 w-4" aria-hidden="true" />
                {t('admin.title')}
              </Link>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Item asChild>
            <Link to="/change-password" className={ITEM_CLASS}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {t('auth.changePassword')}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />

          <DropdownMenu.Item
            className={cn(ITEM_CLASS, 'text-danger data-[highlighted]:bg-danger-50')}
            onSelect={(event) => {
              event.preventDefault();
              void signOut();
            }}
            disabled={busy}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {busy ? t('common.loading') : t('auth.logout')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
