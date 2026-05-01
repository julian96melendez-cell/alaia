import {
    onAuthStateChanged,
    signOut,
    updateProfile,
    User,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../firebase/firebaseConfig";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateUserProfile?: (name: string, photo?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return unsub;
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  const updateUserProfile = async (name: string, photo?: string) => {
    if (!auth.currentUser) return;

    await updateProfile(auth.currentUser, {
      displayName: name,
      photoURL: photo,
    });

    // refrescar estado
    setUser({ ...auth.currentUser });
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, logout, updateUserProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);