import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as api from "../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Remove tokens saved by versions released before the HttpOnly-cookie migration.
    window.sessionStorage.removeItem("shades_world_session");
    let active = true;
    const restore = async () => {
      try {
        let restored;
        try {
          restored = await api.getCurrentUser();
        } catch (error) {
          if (error.status !== 401) throw error;
          await api.refreshAccessToken();
          restored = await api.getCurrentUser();
        }
        if (active) setUser(restored);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    restore();
    return () => { active = false; };
  }, []);

  const loadUser = async () => {
    const current = await api.getCurrentUser();
    setUser(current);
    return current;
  };

  const signIn = async (email, password) => {
    await api.login(email.trim().toLowerCase(), password);
    return loadUser();
  };

  const register = async (customer) => {
    return api.register({
      ...customer,
      name: customer.name.trim(),
      email: customer.email.trim().toLowerCase(),
      phoneNumber: customer.phoneNumber?.trim(),
    });
  };

  const signInWithGoogle = useCallback(async (credential) => {
    await api.googleLogin(credential);
    const current = await api.getCurrentUser();
    setUser(current);
    return current;
  }, []);

  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    accessToken: user ? "cookie-session" : null,
    loading,
    isAuthenticated: Boolean(user),
    isAdmin: user?.roles?.includes("ADMIN") || false,
    signIn,
    register,
    signInWithGoogle,
    updateUser: setUser,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
