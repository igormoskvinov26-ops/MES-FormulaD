import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { api, type PrintTemplateItem } from './api';

const FIELD_TOKENS: { label: string; token: string }[] = [
  { label: 'VIN',       token: '{{VIN}}' },
  { label: 'Модель',    token: '{{MODEL}}' },        // check-secrets:ignore
  { label: 'Цвет',      token: '{{COLOR}}' },        // check-secrets:ignore
  { label: 'Номер NCP', token: '{{NCP_NUMBER}}' },   // check-secrets:ignore
  { label: 'Инспектор', token: '{{INSPECTOR}}' },    // check-secrets:ignore
  { label: 'Дата',      token: '{{DATE}}' },         // check-secrets:ignore
];

function TemplateEditor({
  template,
  onSaved,
}: {
  template: PrintTemplateItem;
  onSaved: (t: PrintTemplateItem) => void;
}) {
  const [name, setName] = useState(template.name);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: template.bodyHtml,
  });

  // reset when switching templates
  useEffect(() => {
    setName(template.name);
    setSaveError('');
    setPreviewUrl(null);
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(template.bodyHtml);
    }
  }, [template.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function insertToken(token: string) {
    editor?.chain().focus().insertContent(token).run();
  }

  function insertTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  async function save() {
    if (!editor) return;
    setSaving(true);
    setSaveError('');
    try {
      const saved = await api.savePrintTemplate(template.id, name, editor.getHTML());
      onSaved(saved);
    } catch {
      setSaveError('Не удалось сохранить шаблон');
    } finally {
      setSaving(false);
    }
  }

  async function preview() {
    if (!editor) return;
    // save first, then render
    setSaving(true);
    setSaveError('');
    try {
      await api.savePrintTemplate(template.id, name, editor.getHTML());
      setPreviewing(true);
      const resp = await api.renderPrintTemplate(template.id, { vin: 'DEMO-VIN-00001', model: 'ATV-X600', color: 'Красный' });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch {
      setSaveError('Не удалось сформировать превью');
    } finally {
      setSaving(false);
      setPreviewing(false);
    }
  }

  return (
    <div className="print-template-editor">
      <div className="print-template-header">
        <label className="print-template-name-label">
          Название
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            aria-label="Название шаблона"
          />
        </label>
      </div>

      <div className="print-template-toolbar" role="toolbar" aria-label="Форматирование">
        <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} aria-pressed={editor?.isActive('bold')}>Ж</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} aria-pressed={editor?.isActive('italic')}>К</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>Список</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>Нумерация</button>
        <button type="button" onClick={insertTable}>Таблица</button>
        <span className="print-template-sep" aria-hidden="true">|</span>
        {FIELD_TOKENS.map((f) => (
          <button key={f.token} type="button" onClick={() => insertToken(f.token)} title={`Вставить поле ${f.label}`}>
            + {f.label}
          </button>
        ))}
      </div>

      <EditorContent editor={editor} className="print-template-body" />

      {saveError && <p role="alert" className="error">{saveError}</p>}

      <div className="print-template-actions">
        <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button type="button" onClick={() => void preview()} disabled={saving || previewing}>
          Превью PDF
        </button>
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="button">
            Открыть PDF
          </a>
        )}
      </div>
    </div>
  );
}

export function PrintTemplateAdmin() {
  const [templates, setTemplates] = useState<PrintTemplateItem[]>([]);
  const [selected, setSelected] = useState<PrintTemplateItem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.printTemplates()
      .then((items) => { setTemplates(items); if (items.length > 0) setSelected(items[0]); })
      .catch(() => setError('Не удалось загрузить шаблоны'));
  }, []);

  function handleSaved(updated: PrintTemplateItem) {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelected(updated);
  }

  return (
    <div className="print-template-admin">
      {error && <p role="alert" className="error">{error}</p>}
      <div className="print-template-layout">
        <ul className="print-template-list" aria-label="Шаблоны печатных форм">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={selected?.id === t.id ? 'primary' : undefined}
                aria-pressed={selected?.id === t.id}
                onClick={() => setSelected(t)}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="print-template-content">
          {selected ? (
            <TemplateEditor key={selected.id} template={selected} onSaved={handleSaved} />
          ) : (
            <p className="muted">Выберите шаблон из списка</p>
          )}
        </div>
      </div>
    </div>
  );
}
