import { useParams } from 'react-router-dom';
import { useI18n } from '../i18n';

/** Candidate detail / scoring report. Implemented in T5. */
export default function CandidateReport() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  return (
    <section className="page">
      <h1>{t('report.title')}</h1>
      <p className="placeholder">{t('report.body', { id: id ?? '' })}</p>
    </section>
  );
}
