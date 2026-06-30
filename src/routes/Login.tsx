import { useAuth } from '../auth/identity';

/** Login gate shown when there is no Identity session (Netlify Identity widget). */
export default function LoginGate() {
  const { login } = useAuth();
  return (
    <div className="gate">
      <div className="gate-card">
        <h1>VC Scout</h1>
        <p className="placeholder">Sign in to ingest and score candidates.</p>
        <button type="button" className="btn" onClick={login}>
          Log in / Sign up
        </button>
      </div>
    </div>
  );
}
