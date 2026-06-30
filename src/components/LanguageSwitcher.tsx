import { LOCALE_NAMES, SUPPORTED_LOCALES, useI18n, type Locale } from '../i18n';

/**
 * Inline language switcher. Writes the `lang` cookie (so the edge function and
 * reloads keep the choice) and re-renders the app in the selected locale.
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <span className="lang-switch" role="group" aria-label="Language">
      {SUPPORTED_LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          className={`lang-btn${code === locale ? ' lang-btn-active' : ''}`}
          onClick={() => setLocale(code)}
          aria-pressed={code === locale}
        >
          {LOCALE_NAMES[code]}
        </button>
      ))}
    </span>
  );
}
