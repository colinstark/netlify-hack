import { Routes, Route, Link } from 'react-router-dom';
import Login from './routes/Login';
import NewCandidate from './routes/NewCandidate';
import CandidateList from './routes/CandidateList';
import CandidateReport from './routes/CandidateReport';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          VC&nbsp;Scout
        </Link>
        <nav className="nav">
          <Link to="/">Candidates</Link>
          <Link to="/new">New candidate</Link>
          <Link to="/login">Login</Link>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<CandidateList />} />
          <Route path="/new" element={<NewCandidate />} />
          <Route path="/candidate/:id" element={<CandidateReport />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </div>
  );
}
