import { useParams } from 'react-router-dom';

/** Candidate detail / scoring report. Implemented in T5. */
export default function CandidateReport() {
  const { id } = useParams<{ id: string }>();
  return (
    <section className="page">
      <h1>Candidate report</h1>
      <p className="placeholder">
        Report for candidate <code>{id}</code> is built in task T5.
      </p>
    </section>
  );
}
