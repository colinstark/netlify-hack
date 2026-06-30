import type { Config, Context } from '@netlify/edge-functions';

/**
 * i18n edge function (task T6).
 *
 * Runs on the SPA route. Detects the visitor's locale from, in priority order:
 *   1. `lang` cookie (manual override — always wins)
 *   2. `Accept-Language` header (first supported primary subtag by q-value)
 *   3. Netlify geo country code (DE/AT/CH → de, ES/MX/... → es, else en)
 *   4. English (default)
 *
 * Seeds the `lang` cookie on first visit so the FE reads a single source of
 * truth and manual switches (written by the FE) persist across reloads.
 */

const SUPPORTED = ['de', 'en', 'es'] as const;
type Locale = (typeof SUPPORTED)[number];
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

function detectLocale(request: Request, context: Context): Locale {
  // 1. Existing cookie (manual override or prior detection).
  const fromCookie = context.cookies.get(COOKIE);
  if (isLocale(fromCookie)) return fromCookie;

  // 2. Accept-Language.
  const fromHeader = fromAcceptLanguage(request.headers.get('accept-language'));
  if (fromHeader) return fromHeader;

  // 3. Geo country.
  const countryCode = context.geo?.country?.code;
  if (countryCode && COUNTRY_TO_LOCALE[countryCode]) {
    return COUNTRY_TO_LOCALE[countryCode];
  }

  return DEFAULT_LOCALE;
}

export default async function i18n(request: Request, context: Context): Promise<Response> {
  // Only intercept HTML document requests; let assets pass through untouched.
  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) {
    return context.next();
  }

  const locale = detectLocale(request, context);
  const response = await context.next();

  // Seed the cookie once so the FE and subsequent requests agree. Never overwrite
  // an explicit user choice (handled above — if the cookie exists, we keep it).
  const existing = context.cookies.get(COOKIE);
  if (!isLocale(existing)) {
    response.headers.append(
      'set-cookie',
      `${COOKIE}=${locale}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`,
    );
  }
  return response;
}

export const config: Config = {
  path: '/*',
  // Never intercept API or function traffic.
  excludedPath: ['/api/*', '/.netlify/*'],
};
