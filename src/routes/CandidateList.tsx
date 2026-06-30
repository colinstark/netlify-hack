import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import { useI18n, type TranslationKey } from '../i18n';
import type { CandidateListItem } from '../types';

const ACTIVE = new Set(['pending', 'enriching', 'enriched', 'scoring']);

type SortKey = 'newest' | 'score' | 'status';

const SORT_KEYS: SortKey[] = ['newest', 'score', 'status'];

function sortCandidates(rows: CandidateListItem[], sort: SortKey): CandidateListItem[] {
  const copy = [...rows];
  if (sort === 'score') {
    copy.sort((a, b) => (b.latestScore?.score ?? -1) - (a.latestScore?.score ?? -1));
  } else if (sort === 'status') {
    copy.sort((a, b) => a.status.localeCompare(b.status) || b.createdAt.localeCompare(a.createdAt));
  } else {
    copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return copy;
}

export default function CandidateList() {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch('/api/candidates');
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data: CandidateListItem[] = await res.json();
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

  const sorted = sortCandidates(candidates, sort);

  async function deleteCandidate(candidate: CandidateListItem): Promise<void> {
    if (deletingIds.has(candidate.id)) return;
    if (!window.confirm(t('list.deleteConfirm'))) return;

    setError(null);
    setDeletingIds((prev) => new Set(prev).add(candidate.id));
    try {
      const res = await apiFetch(`/api/candidates/${candidate.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${t('list.deleteFailed')} (${res.status})`);
      }
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  }

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
        <>
          <div className="sort-bar">
            <label htmlFor="sort-select" className="placeholder">{t('list.sortLabel')}</label>
            <select
              id="sort-select"
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>{t(`list.sort_${k}` as TranslationKey)}</option>
              ))}
            </select>
          </div>

          <ul className="candidate-list">
            {sorted.map((c) => (
              <li key={c.id}>
                <div className="candidate-row">
                  <Link to={`/candidate/${c.id}`} className="candidate-main">
                    <span className="candidate-title">{c.title}</span>
                    <div className="candidate-meta">
                      {c.latestScore && (
                        <span className={`score-pill score-${tier(c.latestScore.score)}`}>{c.latestScore.score}</span>
                      )}
                      <span className={`badge badge-${ACTIVE.has(c.status) ? 'active' : c.status}`}>
                        {t(`status.${c.status}` as TranslationKey)}
                      </span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="linkbtn danger-btn"
                    disabled={deletingIds.has(c.id)}
                    onClick={() => void deleteCandidate(c)}
                  >
                    {deletingIds.has(c.id) ? t('list.deleting') : t('list.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function tier(score: number): 'high' | 'mid' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}
