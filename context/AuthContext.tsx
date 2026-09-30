import {
  onAuthStateChanged,
  signOut,
  updateProfile,
  User,
} from "firebase/auth";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { auth as firebaseAuth } from "../firebase/firebaseConfig";
type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  updateUserProfile: (name: string, photo?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  logout: async () => {},
  reloadUser: async () => {},
  updateUserProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseAuth) {
      console.log("AUTH ERROR: firebaseAuth is undefined");
      setUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      },
      (error) => {
        console.log("AUTH STATE ERROR:", error);
        setUser(null);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const reloadUser = useCallback(async () => {
    if (!firebaseAuth?.currentUser) {
      setUser(null);
      return;
    }

    await firebaseAuth.currentUser.reload();
    setUser(firebaseAuth.currentUser);
  }, []);

  const logout = useCallback(async () => {
    if (!firebaseAuth) return;

    await signOut(firebaseAuth);
    setUser(null);
  }, []);

  const updateUserProfile = useCallback(
    async (name: string, photo?: string) => {
      const cleanName = name.trim();

      if (!firebaseAuth?.currentUser) {
        throw new Error("No hay usuario autenticado.");
      }

      if (!cleanName) {
        throw new Error("El nombre no puede estar vacío.");
      }

      await updateProfile(firebaseAuth.currentUser, {
        displayName: cleanName,
        photoURL: photo ?? firebaseAuth.currentUser.photoURL,
      });

      await reloadUser();
    },
    [reloadUser]
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      logout,
      reloadUser,
      updateUserProfile,
    }),
    [user, loading, logout, reloadUser, updateUserProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}