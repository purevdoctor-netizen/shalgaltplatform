/**
 * Excel / CSV импортын харилцах цонх.
 */

import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useT } from '../../i18n';
import {
  IMPORT_COLUMNS,
  downloadImportTemplate,
  importQuestionsFromFile,
  type ImportRowError,
} from '../../lib/importQuestions';
import type { DraftQuestion } from '../../lib/examDraft';
import { Alert, Button, Dialog } from '../ui';

export function ImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (questions: DraftQuestion[]) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setErrors([]);
    setFatal(null);

    try {
      const result = await importQuestionsFromFile(file);
      setErrors(result.errors);

      if (result.questions.length === 0) {
        setFatal(t('import.noValidRows'));
        return;
      }

      onImport(result.questions);
      // Алдаагүй бол цонхыг хаана; алдаатай бол хэрэглэгч уншиж амжина
      if (result.errors.length === 0) onOpenChange(false);
    } catch (error) {
      setFatal(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('import.title')}
      description={t('import.columns')}
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-600">{t('import.correctHint')}</p>
          <div className="overflow-x-auto">
            <code className="whitespace-nowrap text-xs text-slate-500">
              {IMPORT_COLUMNS.join(' · ')}
            </code>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadImportTemplate('xlsx')}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('import.downloadTemplate')} (.xlsx)
          </Button>
          <Button variant="ghost" onClick={() => downloadImportTemplate('csv')}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            .csv
          </Button>
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            className="sr-only"
            id="import-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button asChild block size="lg" disabled={busy}>
            <label htmlFor="import-file" className="cursor-pointer">
              <Upload className="h-5 w-5" aria-hidden="true" />
              {busy ? t('common.loading') : t('import.selectFile')}
            </label>
          </Button>
        </div>

        {fatal && <Alert tone="danger">{fatal}</Alert>}

        {errors.length > 0 && (
          <Alert tone="warning" title={t('import.errorsFound', { count: errors.length })}>
            <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-xs">
              {errors.map((error) => (
                <li key={`${error.row}-${error.message}`}>
                  {t('import.rowError', { row: error.row, message: error.message })}
                </li>
              ))}
            </ul>
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
