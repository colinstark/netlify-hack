import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './auth/identity';
import LoginGate from './routes/Login';
import NewCandidate from './routes/NewCandidate';
import CandidateList from './routes/CandidateList';
import CandidateReport from './routes/CandidateReport';

export default function App() {
  const { user, ready, logout } = useAuth();

  if (!ready) {
    return <div className="content">Loading…</div>;
  }

  // Whole app is gated: no session, no access (shared-team model).
  if (!user) {
    return <LoginGate />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          VC&nbsp;Scout
        </Link>
        <nav className="nav">
          <Link to="/">Candidates</Link>
          <Link to="/new">New candidate</Link>
          <span className="user">{user.email}</span>
          <button type="button" className="linkbtn" onClick={logout}>
            Log out
          </button>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<CandidateList />} />
          <Route path="/new" element={<NewCandidate />} />
          <Route path="/candidate/:id" element={<CandidateReport />} />
        </Routes>
      </main>
    </div>
  );
}
