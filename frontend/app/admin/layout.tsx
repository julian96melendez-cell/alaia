"use client";

import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "../../firebase/firebaseConfig";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthorized(true);
      } else {
        setAuthorized(false);
        router.replace("/login");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div style={loadingStyle}>
        Verificando acceso administrativo…
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      {children}
    </div>
  );
}

const loadingStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f7f7f8",
  color: "#555",
  fontSize: 14,
};