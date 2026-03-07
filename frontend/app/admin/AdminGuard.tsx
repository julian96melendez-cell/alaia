"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getToken } from "../../lib/auth";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) router.replace("/login");
  }, [router]);

  return <>{children}</>;
}