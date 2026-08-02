import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as api from "../services/api";

const SESSION_KEY = "shades_world_session";
const AuthContext = createContext(null);

const tokenExpiresAt = (token) => {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).exp * 1000;
  } catch {
    return 0;
  }
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(Boolean(session?.accessToken));

  const storeSession = useCallback((nextSession) => {
    setSession(nextSession);
    if (nextSession) sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    else sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const renewSession = useCallback(async (currentSession) => {
    if (!currentSession?.refreshToken) throw new Error("Your session has expired.");
    const tokens = await api.refreshAccessToken(currentSession.refreshToken);
    const nextSession = { ...currentSession, ...tokens, user: currentSession.user };
    storeSession(nextSession);
    return nextSession;
  }, [storeSession]);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    const validateSession = async () => {
      let activeSession = session;
      if (tokenExpiresAt(activeSession.accessToken) <= Date.now() + 30000) {
        activeSession = await renewSession(activeSession);
      }
      const user = await api.getCurrentUser(activeSession.accessToken);
      storeSession({ ...activeSession, user });
    };

    validateSession()
      .catch(() => {
        storeSession(null);
      })
      .finally(() => setLoading(false));
    // Validate only when a stored token is first restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.accessToken || !session?.refreshToken) return undefined;
    const delay = Math.max(0, tokenExpiresAt(session.accessToken) - Date.now() - 30000);
    const timer = window.setTimeout(() => {
      renewSession(session).catch(() => storeSession(null));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [session, renewSession, storeSession]);

  const signIn = async (email, password) => {
    const tokens = await api.login(email.trim().toLowerCase(), password);
    const user = await api.getCurrentUser(tokens.accessToken);
    const nextSession = { ...tokens, user };
    storeSession(nextSession);
    return user;
  };

  const register = async (customer) => {
    const tokens = await api.register({
      ...customer,
      name: customer.name.trim(),
      email: customer.email.trim().toLowerCase(),
      phoneNumber: customer.phoneNumber?.trim(),
    });
    const user = await api.getCurrentUser(tokens.accessToken);
    const nextSession = { ...tokens, user };
    storeSession(nextSession);
    return user;
  };

  const signInWithGoogle = useCallback(async (credential) => {
    const tokens = await api.googleLogin(credential);
    const user = await api.getCurrentUser(tokens.accessToken);
    const nextSession = { ...tokens, user };
    storeSession(nextSession);
    return user;
  }, [storeSession]);

  const signOut = async () => {
    const token = session?.accessToken;
    storeSession(null);
    if (token) await api.logout(token).catch(() => undefined);
  };

  const value = {
    user: session?.user || null,
    accessToken: session?.accessToken || null,
    loading,
    isAuthenticated: Boolean(session?.user),
    isAdmin: session?.user?.roles?.includes("ADMIN") || false,
    signIn,
    register,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
