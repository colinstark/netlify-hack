import type { Config, Context } from '@netlify/edge-functions';

/**
 * i18n edge function (task T6).
 *
 * Runs on the SPA route. Detects the visitor's locale from, in priority order:
 *   1. `?lang=de|en|es` query param (explicit override, persists to cookie)
 *   2. `lang` cookie (manual override — wins over browser/geo)
 *   3. `Accept-Language` header (first supported primary subtag by q-value)
 *   4. Netlify geo country code (DE/AT/CH → de, ES/MX/... → es, else en)
 *   5. English (default)
 *
 * Seeds the `lang` cookie on first visit so the FE reads a single source of
 * truth and manual switches (written by the FE) persist across reloads.
 */

const SUPPORTED = ['de', 'en', 'es'] as const;
type Locale = (typeof SUPPORTED)[number];
type LocaleSource = 'query' | 'cookie' | 'accept-language' | 'geo' | 'default';
const DEFAULT_LOCALE: Locale = 'en';
const COOKIE = 'lang';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  DE: 'de', AT: 'de', CH: 'de', LI: 'de', LU: 'de', BE: 'de',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
  UY: 'es', EC: 'es', BO: 'es', PY: 'es', CR: 'es', GT: 'es', HN: 'es',
  NI: 'es', PA: 'es', SV: 'es', DO: 'es', CU: 'es', PR: 'es',
  US: 'en', GB: 'en', IE: 'en', CA: 'en', AU: 'en', NZ: 'en',
};

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED as readonly string[]).includes(value);
}

/** Parse an `Accept-Language` header and return the best supported locale, or null. */
function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: (tag ?? '').toLowerCase(), q: Number.isNaN(q) ? 1 : q };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const primary = tag.split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}

function detectLocale(request: Request, context: Context): { locale: Locale; source: LocaleSource; persist: boolean } {
  // 1. Explicit URL override, useful for deterministic links/tests.
  const fromQuery = new URL(request.url).searchParams.get(COOKIE);
  if (isLocale(fromQuery)) return { locale: fromQuery, source: 'query', persist: true };

  // 2. Existing cookie (manual override or prior detection).
  const fromCookie = context.cookies.get(COOKIE);
  if (isLocale(fromCookie)) return { locale: fromCookie, source: 'cookie', persist: false };

  // 3. Accept-Language.
  const fromHeader = fromAcceptLanguage(request.headers.get('accept-language'));
  if (fromHeader) return { locale: fromHeader, source: 'accept-language', persist: true };

  // 4. Geo country.
  const countryCode = context.geo?.country?.code;
  if (countryCode && COUNTRY_TO_LOCALE[countryCode]) {
    return { locale: COUNTRY_TO_LOCALE[countryCode], source: 'geo', persist: true };
  }

  return { locale: DEFAULT_LOCALE, source: 'default', persist: true };
}

export default async function i18n(request: Request, context: Context): Promise<Response> {
  // Only intercept HTML document requests; let assets pass through untouched.
  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) {
    return context.next();
  }

  const detected = detectLocale(request, context);
  const response = await context.next();

  response.headers.set('x-vc-scout-lang', detected.locale);
  response.headers.set('x-vc-scout-lang-source', detected.source);

  // Seed/persist when there was no valid manual cookie, or when URL explicitly
  // requested a locale. Otherwise keep the user's existing cookie untouched.
  if (detected.persist) {
    response.headers.append(
      'set-cookie',
      `${COOKIE}=${detected.locale}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`,
    );
  }
  return response;
}

export const config: Config = {
  path: '/*',
  // Never intercept API or function traffic.
  excludedPath: ['/api/*', '/.netlify/*'],
};
