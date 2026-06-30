import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api';
import { useI18n, type TranslationKey } from '../i18n';
import type { CandidateReport as ReportData, Enrichment, RationaleItem } from '../types';

const POLL_MS = 3000;
const MAX_RAW_CHARS = 8000;

const SOURCE_KEY: Record<Enrichment['sourceType'], TranslationKey> = {
  website: 'report.sourceWebsite',
  github: 'report.sourceGithub',
  linkedin: 'report.sourceLinkedin',
  crunchbase: 'report.sourceCrunchbase',
  file: 'report.sourceFile',
};

const STATUS_KEY: Record<Enrichment['status'], TranslationKey> = {
  ok: 'report.statusOk',
  failed: 'report.statusFailed',
  unavailable: 'report.statusUnavailable',
  pending: 'report.statusPending',
};

const STATUS_BADGE: Record<Enrichment['status'], string> = {
  ok: 'scored',
  failed: 'failed',
  unavailable: 'active',
  pending: 'active',
};

function scoreClass(score: number): string {
  if (score >= 70) return 'score-high';
  if (score >= 40) return 'score-mid';
  return 'score-low';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatBytes(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CandidateReport() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);

  async function load(): Promise<void> {
    if (!id) return;
    try {
      const res = await apiFetch(`/api/candidates/${id}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: ReportData = await res.json();
      setReport(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setReport(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // While a re-score is in flight, poll until the candidate leaves the `scoring` state.
  useEffect(() => {
    if (!rescoring) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescoring, id]);

  // Stop polling once scoring finishes (scored / failed / anything else).
  useEffect(() => {
    const status = report?.candidate.status;
    if (rescoring && status && status !== 'scoring') setRescoring(false);
  }, [report?.candidate.status, rescoring]);

  async function rescore(): Promise<void> {
    if (!id || rescoring) return;
    setRescoring(true);
    setReport((prev) =>
      prev ? { ...prev, candidate: { ...prev.candidate, status: 'scoring' } } : prev,
    );
    try {
      const res = await apiFetch(`/api/candidates/${id}/rescore`, { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (e) {
      setRescoring(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <section className="page">
        <h1>{t('report.title')}</h1>
        <p className="placeholder">{t('common.loading')}</p>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="page">
        <Link to="/" className="back">{t('common.back')}</Link>
        <h1>{t('report.title')}</h1>
        <p className="error">{error ? `${t('report.loadFailed')} (${error})` : t('report.notFound')}</p>
      </section>
    );
  }

  const { candidate, latestScore, scoreHistory, enrichment, files } = report;
  const status = candidate.status;
  const rationale = latestScore?.rationale ?? [];
  const strengths = rationale.filter((r) => r.sentiment === '+');
  const risks = rationale.filter((r) => r.sentiment === '-');
  const enrichmentRows = enrichment.filter((e) => e.sourceType !== 'file');
  const scoring = status === 'scoring' || rescoring;

  return (
    <section className="page report">
      <Link to="/" className="back">{t('common.back')}</Link>

      <div className="page-head">
        <h1>{candidate.title}</h1>
        <span className={`badge badge-${status}`}>{t(`status.${status}` as TranslationKey)}</span>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Score */}
      <div className="score-block">
        {latestScore ? (
          <div className={`score-number ${scoreClass(latestScore.score)}`}>
            <span className="score-value">{latestScore.score}</span>
            <span className="score-out-of">/100</span>
          </div>
        ) : (
          <div className="score-number">
            <span className="score-value placeholder">—</span>
          </div>
        )}
        <div className="score-meta">
          {latestScore ? (
            <>
              <p className="placeholder">
                {latestScore.model && `${t('report.model')}: ${latestScore.model}`}
              </p>
              <p className="placeholder">{formatDate(latestScore.createdAt)}</p>
            </>
          ) : status === 'failed' ? (
            <p className="error">{candidate.error ?? t('report.notScored')}</p>
          ) : (
            <p className="placeholder">{t('report.notScored')}</p>
          )}
          <button type="button" className="btn" onClick={rescore} disabled={scoring}>
            {scoring ? t('report.rescoring') : t('report.rescore')}
          </button>
        </div>
      </div>

      {/* Rationale */}
      {rationale.length > 0 && (
        <div className="rationale-grid">
          <RationaleCard
            title={t('report.strengths')}
            items={strengths}
            tone="positive"
            empty={t('report.noStrengths')}
          />
          <RationaleCard
            title={t('report.risks')}
            items={risks}
            tone="negative"
            empty={t('report.noRisks')}
          />
        </div>
      )}

      {/* Enrichment */}
      <section className="report-section">
        <h2>{t('report.enrichment')}</h2>
        {enrichmentRows.length === 0 ? (
          <p className="placeholder">{t('report.noEnrichment')}</p>
        ) : (
          <div className="enrichment-list">
            {enrichmentRows.map((e) => (
              <EnrichmentCard key={e.id} row={e} />
            ))}
          </div>
        )}
      </section>

      {/* Files */}
      <section className="report-section">
        <h2>{t('report.files')}</h2>
        {files.length === 0 ? (
          <p className="placeholder">{t('report.noFiles')}</p>
        ) : (
          <div className="enrichment-list">
            {files.map((f) => (
              <article key={f.id} className="enrichment-card">
                <header>
                  <span className="source-label">{f.filename}</span>
                  {f.size != null && <span className="placeholder file-size">{formatBytes(f.size)}</span>}
                </header>
                {f.extractedText ? (
                  <details>
                    <summary>{t('report.extractedText')}</summary>
                    <pre className="raw-text">{f.extractedText}</pre>
                  </details>
                ) : (
                  <p className="placeholder">{t('report.noText')}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Score history */}
      {scoreHistory.length > 0 && (
        <section className="report-section">
          <h2>{t('report.history')}</h2>
          <ul className="history-list">
            {scoreHistory.map((s, i) => (
              <li key={s.id} className={i === 0 ? 'history-latest' : ''}>
                <span className={`history-score ${scoreClass(s.score)}`}>{s.score}</span>
                <span className="placeholder">{formatDate(s.createdAt)}</span>
                {s.model && <span className="placeholder">{s.model}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function RationaleCard({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: RationaleItem[];
  tone: 'positive' | 'negative';
  empty: string;
}) {
  const { t } = useI18n();
  return (
    <article className={`rationale-card rationale-${tone}`}>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="placeholder">{empty}</p>
      ) : (
        <ul className="rationale-items">
          {items.map((item, idx) => (
            <li key={idx}>
              <div className="rationale-head">
                <span className="rationale-factor">{item.factor}</span>
                <span className="rationale-weight">{`${t('report.weight')}: ${item.weight}`}</span>
              </div>
              {item.detail && <p className="rationale-detail">{item.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function EnrichmentCard({ row }: { row: Enrichment }) {
  const { t } = useI18n();
  const unavailable = row.status === 'unavailable';
  const failed = row.status === 'failed';
  const rawJson =
    row.raw != null
      ? JSON.stringify(row.raw, null, 2).slice(0, MAX_RAW_CHARS)
      : '';

  return (
    <article className="enrichment-card">
      <header>
        <span className="source-label">{t(SOURCE_KEY[row.sourceType])}</span>
        <span className={`badge badge-${STATUS_BADGE[row.status]}`}>{t(STATUS_KEY[row.status])}</span>
      </header>
      {failed && row.error && <p className="error">{row.error}</p>}
      {!failed && (unavailable ? <p className="placeholder">{t('report.unavailable')}</p> : row.summary && <p>{row.summary}</p>)}
      {rawJson && !unavailable && (
        <details>
          <summary>{t('report.raw')}</summary>
          <pre className="raw-text">{rawJson}</pre>
        </details>
      )}
    </article>
  );
}
