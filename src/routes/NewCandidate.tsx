import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { useI18n } from '../i18n';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Editable list of URL inputs (LinkedIn / GitHub). */
function UrlList({
  label,
  placeholder,
  removeLabel,
  addLabel,
  urls,
  onChange,
}: {
  label: string;
  placeholder: string;
  removeLabel: string;
  addLabel: string;
  urls: string[];
  onChange: (next: string[]) => void;
}) {
  const set = (i: number, v: string) => onChange(urls.map((u, idx) => (idx === i ? v : u)));
  const add = () => onChange([...urls, '']);
  const remove = (i: number) => onChange(urls.filter((_, idx) => idx !== i));

  return (
    <fieldset className="field">
      <legend>{label}</legend>
      {urls.map((url, i) => (
        <div className="row" key={i}>
          <input
            type="url"
            placeholder={placeholder}
            value={url}
            onChange={(e) => set(i, e.target.value)}
          />
          <button type="button" className="linkbtn" onClick={() => remove(i)}>
            {removeLabel}
          </button>
        </div>
      ))}
      <button type="button" className="linkbtn" onClick={add}>
        {addLabel}
      </button>
    </fieldset>
  );
}

export default function NewCandidate() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [linkedinUrls, setLinkedinUrls] = useState<string[]>([]);
  const [githubUrls, setGithubUrls] = useState<string[]>([]);
  const [crunchbaseUrls, setCrunchbaseUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const encoded = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          contentType: file.type || undefined,
          dataBase64: await fileToBase64(file),
        })),
      );

      const res = await apiFetch('/api/candidates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          projectUrl,
          linkedinUrls,
          githubUrls,
          crunchbaseUrls,
          notes,
          files: encoded,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page">
      <h1>{t('form.heading')}</h1>
      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          <span>
            {t('form.titleLabel')} *
          </span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>

        <label className="field">
          <span>{t('form.projectUrl')}</span>
          <input
            type="url"
            placeholder={t('form.phProjectUrl')}
            value={projectUrl}
            onChange={(e) => setProjectUrl(e.target.value)}
          />
        </label>

        <UrlList
          label={t('form.linkedinUrls')}
          placeholder={t('form.phLinkedin')}
          removeLabel={t('form.remove')}
          addLabel={t('form.addAnother')}
          urls={linkedinUrls}
          onChange={setLinkedinUrls}
        />
        <UrlList
          label={t('form.githubUrls')}
          placeholder={t('form.phGithub')}
          removeLabel={t('form.remove')}
          addLabel={t('form.addAnother')}
          urls={githubUrls}
          onChange={setGithubUrls}
        />
        <UrlList
          label={t('form.crunchbaseUrls')}
          placeholder={t('form.phCrunchbase')}
          removeLabel={t('form.remove')}
          addLabel={t('form.addAnother')}
          urls={crunchbaseUrls}
          onChange={setCrunchbaseUrls}
        />

        <label className="field">
          <span>{t('form.notes')}</span>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <label className="field">
          <span>{t('form.files')}</span>
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? t('form.submitting') : t('form.create')}
        </button>
      </form>
    </section>
  );
}
