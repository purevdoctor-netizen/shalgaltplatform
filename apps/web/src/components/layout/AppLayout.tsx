/**
 * Аппын ерөнхий бүтэц — толгой хэсэг, агуулга, онлайн индикатор.
 */

import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Languages } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n, useT } from '../../i18n';
import { config } from '../../config';
import { cn } from '../../lib/utils';
import { Button } from '../ui';
import { OnlineIndicator } from './OnlineIndicator';
import { UpdatePrompt } from './UpdatePrompt';
import { UserMenu } from './UserMenu';

export function AppLayout({
  children,
  title,
  subtitle,
  actions,
  wide,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print bg-header-gradient text-white shadow-soft">
        <div
          className={cn(
            'mx-auto flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6',
            wide ? 'max-w-[1600px]' : 'max-w-5xl',
          )}
        >
          <Link
            to="/"
            className="flex min-h-touch items-center gap-2 rounded-xl px-1 font-semibold focus-visible:ring-white"
          >
            <img src="/favicon.svg" alt="" className="h-7 w-7" aria-hidden="true" />
            <span className="hidden sm:inline">{config.appName}</span>
            <span className="sm:hidden">{t('app.name')}</span>
          </Link>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {actions}
            <UserMenu />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocale(locale === 'mn' ? 'en' : 'mn')}
              className="text-white hover:bg-white/15"
              aria-label={t('common.language')}
              title={t('common.language')}
            >
              <Languages className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase">{locale}</span>
            </Button>
          </div>
        </div>

        {(title || subtitle) && (
          <div
            className={cn('mx-auto px-4 pb-5 pt-1 sm:px-6', wide ? 'max-w-[1600px]' : 'max-w-5xl')}
          >
            {title && <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm text-white/85">{subtitle}</p>}
          </div>
        )}
      </header>

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'mx-auto w-full flex-1 px-4 py-6 sm:px-6',
          wide ? 'max-w-[1600px]' : 'max-w-5xl',
        )}
      >
        {children}
      </motion.main>

      <OnlineIndicator />
      <UpdatePrompt />
    </div>
  );
}
