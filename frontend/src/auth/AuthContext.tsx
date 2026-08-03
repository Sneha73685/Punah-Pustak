import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import * as authApi from "@/api/auth";
import {
  restoreSession,
  setPasswordChangeRequiredHandler,
  setSessionExpiredHandler,
} from "@/api/client";
import { ApiError } from "@/api/errors";
import { setAccessToken } from "@/api/tokenStore";
import * as usersApi from "@/api/users";
import type { LoginRequest, RegisterRequest, UserPublic } from "@/api/types";

/**
 * Three states this app can be in beyond plain "logged in or not" —
 * `must_change_password` (FR-015) is deliberately never exposed on
 * `UserPublic` (see the backend's `users/schemas.py`), so the only way the
 * frontend learns about it is a `403 PASSWORD_CHANGE_REQUIRED` from
 * *any* authenticated call, including the very first one this app makes
 * right after login (`getOwnProfile`, below) — there is no separate
 * "check if I need to change my password" endpoint to call proactively.
 */
type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "password-change-required" }
  | { status: "authenticated"; user: UserPublic };

interface AuthContextValue {
  state: AuthState;
  login: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Called by the forced-password-change screen once it succeeds, to
   * transition out of "password-change-required" without a full reload. */
  completePasswordChange: () => Promise<void>;
  /** Called by `ProfilePage` after a display-name change (FR-030) — the
   * current user lives in this context's own state, not TanStack Query, so
   * re-fetching it is how the nav/profile page picks up the new value
   * without a full page reload. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const navigate = useNavigate();

  const loadCurrentUser = useCallback(async (): Promise<void> => {
    try {
      const user = await usersApi.getOwnProfile();
      setState({ status: "authenticated", user });
    } catch (error) {
      if (error instanceof ApiError && error.code === "PASSWORD_CHANGE_REQUIRED") {
        // The global handler (registered below) already navigates; this
        // just keeps context state in sync with it.
        setState({ status: "password-change-required" });
        return;
      }
      setAccessToken(null);
      setState({ status: "unauthenticated" });
    }
  }, []);

  // Mount-time session restore from the HttpOnly refresh-token cookie
  // (SEC-022) — the in-memory access token (src/api/tokenStore.ts) never
  // survives a full page reload by design, so this is how a returning
  // visitor with a still-valid refresh cookie gets back to "authenticated"
  // without logging in again.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await restoreSession();
      if (cancelled) {
        return;
      }
      if (!token) {
        setState({ status: "unauthenticated" });
        return;
      }
      await loadCurrentUser();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCurrentUser]);

  // FE-022, generalized beyond just login: a 403 PASSWORD_CHANGE_REQUIRED
  // from *any* call (e.g. an admin resets this user's password mid-session,
  // and their next click hits a normal endpoint) redirects here too, not
  // only right after login.
  useEffect(() => {
    setPasswordChangeRequiredHandler(() => {
      setState({ status: "password-change-required" });
      navigate("/change-password", { replace: true });
    });
    setSessionExpiredHandler(() => {
      setState({ status: "unauthenticated" });
      navigate("/login", { replace: true });
    });
    return () => {
      setPasswordChangeRequiredHandler(null);
      setSessionExpiredHandler(null);
    };
  }, [navigate]);

  const login = useCallback(
    async (body: LoginRequest): Promise<void> => {
      const pair = await authApi.login(body);
      setAccessToken(pair.access_token);
      await loadCurrentUser();
    },
    [loadCurrentUser],
  );

  const register = useCallback(async (body: RegisterRequest): Promise<void> => {
    // §8.2: registering does not log the user in — they're redirected to
    // login by the Register page itself, matching the backend's own
    // "not auto-logged-in, to keep auth flow single-path" decision.
    await authApi.register(body);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setState({ status: "unauthenticated" });
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const completePasswordChange = useCallback(async (): Promise<void> => {
    await loadCurrentUser();
    navigate("/", { replace: true });
  }, [loadCurrentUser, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, register, logout, completePasswordChange, refreshUser: loadCurrentUser }),
    [state, login, register, logout, completePasswordChange, loadCurrentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
