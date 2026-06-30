import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import { useI18n, type TranslationKey } from '../i18n';
import type { Candidate } from '../types';

const ACTIVE = new Set(['pending', 'enriching', 'enriched', 'scoring']);

export default function CandidateList() {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch('/api/candidates');
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data: Candidate[] = await res.json();
        if (!cancelled) {
          setCandidates(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // Poll while anything is still being processed.
    const timer = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (loading) return <section className="page"><h1>{t('common.candidates')}</h1><p className="placeholder">{t('common.loading')}</p></section>;

  return (
    <section className="page">
      <div className="page-head">
        <h1>{t('common.candidates')}</h1>
        <Link to="/new" className="btn">{t('common.newCandidate')}</Link>
      </div>

      {error && <p className="error">{error}</p>}

      {candidates.length === 0 ? (
        <p className="placeholder">{t('list.empty')}</p>
      ) : (
        <ul className="candidate-list">
          {candidates.map((c) => (
            <li key={c.id}>
              <Link to={`/candidate/${c.id}`} className="candidate-row">
                <span className="candidate-title">{c.title}</span>
                <span className={`badge badge-${ACTIVE.has(c.status) ? 'active' : c.status}`}>
                  {t(`status.${c.status}` as TranslationKey)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
