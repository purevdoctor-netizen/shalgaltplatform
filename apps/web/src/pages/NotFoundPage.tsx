import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button, EmptyState } from '../components/ui';
import { useT } from '../i18n';

export default function NotFoundPage() {
  const t = useT();
  return (
    <AppLayout>
      <EmptyState
        icon={<SearchX className="h-12 w-12" aria-hidden="true" />}
        title={t('error.notFound')}
        description={t('error.notFoundBody')}
        action={
          <Button asChild>
            <Link to="/">{t('nav.home')}</Link>
          </Button>
        }
      />
    </AppLayout>
  );
}
