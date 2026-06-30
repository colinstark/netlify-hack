import { useAuth } from '../auth/identity';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

/** Login gate shown when there is no Identity session (Netlify Identity widget). */
export default function LoginGate() {
  const { login } = useAuth();
  const { t } = useI18n();
  return (
    <div className="gate">
      <div className="gate-card">
        <h1>{t('common.appName')}</h1>
        <p className="placeholder">{t('login.subtitle')}</p>
        <button type="button" className="btn" onClick={login}>
          {t('login.action')}
        </button>
        <div className="gate-lang">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
