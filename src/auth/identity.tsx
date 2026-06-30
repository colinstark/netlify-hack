import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import netlifyIdentity from 'netlify-identity-widget';

type IdentityUser = netlifyIdentity.User;

interface AuthValue {
  /** Logged-in user, or null. `user.id` is the Identity `sub`. */
  user: IdentityUser | null;
  /** False until the widget has initialised and restored any session. */
  ready: boolean;
  login: () => void;
  logout: () => void;
  /** Fresh JWT for Authorization headers, or null when logged out. */
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

// Initialise the widget exactly once across the app's lifetime. The `init`
// event is one-shot, so React StrictMode's double-mount (setup → cleanup →
// setup) would otherwise consume it on the discarded mount and leave the live
// one stuck on `ready=false`. We guard init() and derive readiness from
// currentUser() instead of depending on the event firing.
let identityInitialised = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<IdentityUser | null>(() =>
    netlifyIdentity.currentUser(),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onInit = (u: IdentityUser | null) => {
      setUser(u);
      setReady(true);
    };
    const onLogin = (u: IdentityUser) => {
      setUser(u);
      netlifyIdentity.close();
    };
    const onLogout = () => setUser(null);

    netlifyIdentity.on('init', onInit);
    netlifyIdentity.on('login', onLogin);
    netlifyIdentity.on('logout', onLogout);

    if (!identityInitialised) {
      identityInitialised = true;
      netlifyIdentity.init();
    }

    // The widget restores any persisted session synchronously, so this is
    // reliable even if the one-shot `init` event was already spent.
    setUser(netlifyIdentity.currentUser());
    setReady(true);

    return () => {
      netlifyIdentity.off('init', onInit);
      netlifyIdentity.off('login', onLogin);
      netlifyIdentity.off('logout', onLogout);
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      login: () => netlifyIdentity.open('login'),
      logout: () => netlifyIdentity.logout(),
      getToken: async () => {
        const current = netlifyIdentity.currentUser();
        if (!current) return null;
        try {
          // refresh() returns a valid JWT (refreshing only if near expiry).
          return await netlifyIdentity.refresh();
        } catch {
          return current.token?.access_token ?? null;
        }
      },
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
