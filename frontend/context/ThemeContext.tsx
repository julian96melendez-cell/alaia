"use client";

import React, { createContext, useContext, useState } from "react";

type Colors = {
  background: string;
  text: string;
  subtext: string;
  textSecondary: string;
  card: string;
  border: string;
  primary: string;
  tint: string;
  error: string;
};

type ThemeContextType = {
  colors: Colors;
  isDarkMode: boolean;
  toggleTheme: () => void;
};

const lightColors: Colors = {
  background: "#ffffff",
  text: "#111827",
  subtext: "#6b7280",
  textSecondary: "#6b7280",
  card: "#f9fafb",
  border: "#e5e7eb",
  primary: "#4f46e5",
  tint: "#4f46e5",
  error: "#ef4444",
};

const darkColors: Colors = {
  background: "#0f172a",
  text: "#f9fafb",
  subtext: "#94a3b8",
  textSecondary: "#94a3b8",
  card: "#1e293b",
  border: "#334155",
  primary: "#6366f1",
  tint: "#6366f1",
  error: "#ef4444",
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleTheme = () => {
    setIsDarkMode((v) => !v);
  };

  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    throw new Error("useThemeContext must be used inside ThemeProvider");
  }

  return ctx;
}