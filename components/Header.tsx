"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useCart } from "../context/CartContext";

type HeaderProps = {
  title?: string;
  showSearch?: boolean;
};

export default function Header({
  title = "HacereShop",
  showSearch = true,
}: HeaderProps) {
  const [search, setSearch] = useState("");
  const { items, totalItems } = useCart();

  const cartCount = useMemo(() => {
    if (typeof totalItems === "number") return totalItems;
    return Array.isArray(items) ? items.length : 0;
  }, [items, totalItems]);

  const wishlistCount = 0;

  return (
    <header style={styles.container}>
      <div style={styles.left}>
        <Link href="/" style={styles.titleLink}>
          <span style={styles.title}>{title}</span>
        </Link>
      </div>

      {showSearch && (
        <div style={styles.center}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar productos..."
            style={styles.input}
          />
        </div>
      )}

      <div style={styles.right}>
        <Link href="/wishlist" style={styles.iconButton}>
          <span style={styles.iconText}>♡</span>
          {wishlistCount > 0 && (
            <span style={styles.badge}>{wishlistCount}</span>
          )}
        </Link>

        <Link href="/cart" style={styles.iconButton}>
          <span style={styles.iconText}>🛒</span>
          {cartCount > 0 && <span style={styles.badge}>{cartCount}</span>}
        </Link>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "16px 20px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e5e7eb",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  left: {
    display: "flex",
    alignItems: "center",
    minWidth: "140px",
  },
  center: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: "120px",
    justifyContent: "flex-end",
  },
  titleLink: {
    textDecoration: "none",
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#111827",
  },
  input: {
    width: "100%",
    maxWidth: "420px",
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    outline: "none",
    fontSize: "14px",
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  iconButton: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    backgroundColor: "#f3f4f6",
    textDecoration: "none",
    color: "#111827",
  },
  iconText: {
    fontSize: "18px",
    lineHeight: 1,
  },
  badge: {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    minWidth: "18px",
    height: "18px",
    padding: "0 5px",
    borderRadius: "999px",
    backgroundColor: "#ef4444",
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};