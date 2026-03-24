import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ApiError, requestJson, requestResponse } from '../../lib/api';
import type {
  AuthAdminRecord,
  AuthLoginResponse,
  AuthSessionPayload,
  AuthTwoFactorChallenge,
  CurrentAdminResponse,
} from '../../lib/api-types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
type LoginOptions = {
  challengeToken?: string;
  twoFactorCode?: string;
};
type LoginResult = { requiresTwoFactor: false } | AuthTwoFactorChallenge;

type AuthContextValue = {
  admin: AuthAdminRecord | null;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  apiFetchResponse: (path: string, init?: RequestInit) => Promise<Response>;
  login: (username: string, password: string, options?: LoginOptions) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  status: AuthStatus;
};

const ACCESS_TOKEN_STORAGE_KEY = 'server-vpn.access-token';

const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredAccessToken(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [admin, setAdmin] = useState<AuthAdminRecord | null>(null);
  const accessTokenRef = useRef<string | null>(
    typeof window === 'undefined' ? null : getStoredAccessToken(),
  );

  const persistToken = useCallback((accessToken: string | null) => {
    accessTokenRef.current = accessToken;

    if (accessToken) {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
      return;
    }

    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }, []);

  const clearSession = useCallback(() => {
    persistToken(null);
    setAdmin(null);
    setStatus('unauthenticated');
  }, [persistToken]);

  const hydrateWithSession = useCallback(
    (payload: AuthSessionPayload) => {
      persistToken(payload.accessToken);
      setAdmin(payload.admin);
      setStatus('authenticated');
    },
    [persistToken],
  );

  const loadProfile = useCallback(async (accessToken: string) => {
    const response = await requestJson<CurrentAdminResponse>('/api/auth/me', {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    setAdmin(response.admin);
    setStatus('authenticated');
  }, []);

  const refreshSession = useCallback(async () => {
    const payload = await requestJson<AuthSessionPayload>('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    hydrateWithSession(payload);
  }, [hydrateWithSession]);

  const login = useCallback(
    async (username: string, password: string, options?: LoginOptions): Promise<LoginResult> => {
      const payload = await requestJson<AuthLoginResponse>('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          twoFactorCode: options?.twoFactorCode,
          twoFactorChallengeToken: options?.challengeToken,
        }),
      });

      if ('requiresTwoFactor' in payload && payload.requiresTwoFactor) {
        return payload;
      }

      hydrateWithSession(payload);
      return {
        requiresTwoFactor: false,
      };
    },
    [hydrateWithSession],
  );

  const logout = useCallback(async () => {
    try {
      await requestJson<{ success: boolean }>('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const apiFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const makeRequestInit = (accessToken: string | null): RequestInit => ({
        ...init,
        credentials: 'include',
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      const makeRequest = async (accessToken: string | null) =>
        requestJson<T>(path, {
          ...makeRequestInit(accessToken),
        });

      try {
        return await makeRequest(accessTokenRef.current);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }

        await refreshSession();
        return makeRequest(accessTokenRef.current);
      }
    },
    [refreshSession],
  );

  const apiFetchResponse = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const makeRequest = async (accessToken: string | null) =>
        requestResponse(path, {
          ...init,
          credentials: 'include',
          headers: {
            ...init?.headers,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });

      try {
        return await makeRequest(accessTokenRef.current);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }

        await refreshSession();
        return makeRequest(accessTokenRef.current);
      }
    },
    [refreshSession],
  );

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const storedToken = accessTokenRef.current;

      if (storedToken) {
        try {
          await loadProfile(storedToken);
          if (!isMounted) {
            return;
          }
          return;
        } catch {
          persistToken(null);
        }
      }

      try {
        await refreshSession();
        if (!isMounted) {
          return;
        }
      } catch {
        if (!isMounted) {
          return;
        }

        clearSession();
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [clearSession, loadProfile, persistToken, refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      admin,
      apiFetch,
      apiFetchResponse,
      login,
      logout,
      refreshSession,
      status,
    }),
    [admin, apiFetch, apiFetchResponse, login, logout, refreshSession, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}
