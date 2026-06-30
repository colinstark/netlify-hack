import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './auth/identity';
import { useI18n } from './i18n';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import LoginGate from './routes/Login';
import NewCandidate from './routes/NewCandidate';
import CandidateList from './routes/CandidateList';
import CandidateReport from './routes/CandidateReport';

export default function App() {
  const { user, ready, logout } = useAuth();
  const { t } = useI18n();

  if (!ready) {
    return <div className="content">{t('common.loading')}</div>;
  }

  // Whole app is gated: no session, no access (shared-team model).
  if (!user) {
    return <LoginGate />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          {t('common.appName')}
        </Link>
        <nav className="nav">
          <Link to="/">{t('common.candidates')}</Link>
          <Link to="/new">{t('common.newCandidate')}</Link>
          <LanguageSwitcher />
          <span className="user">{user.email}</span>
          <button type="button" className="linkbtn" onClick={logout}>
            {t('common.logOut')}
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
