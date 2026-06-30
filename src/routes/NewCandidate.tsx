import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';

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
  urls,
  onChange,
}: {
  label: string;
  placeholder: string;
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
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="linkbtn" onClick={add}>
        + Add {label.toLowerCase()}
      </button>
    </fieldset>
  );
}

export default function NewCandidate() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [linkedinUrls, setLinkedinUrls] = useState<string[]>([]);
  const [githubUrls, setGithubUrls] = useState<string[]>([]);
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
      <h1>New candidate</h1>
      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          <span>Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>

        <label className="field">
          <span>Project URL</span>
          <input
            type="url"
            placeholder="https://example.com"
            value={projectUrl}
            onChange={(e) => setProjectUrl(e.target.value)}
          />
        </label>

        <UrlList
          label="LinkedIn URLs"
          placeholder="https://linkedin.com/in/…"
          urls={linkedinUrls}
          onChange={setLinkedinUrls}
        />
        <UrlList
          label="GitHub URLs"
          placeholder="https://github.com/…"
          urls={githubUrls}
          onChange={setGithubUrls}
        />

        <label className="field">
          <span>Notes</span>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <label className="field">
          <span>Files (PDF / docs)</span>
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Create candidate'}
        </button>
      </form>
    </section>
  );
}
