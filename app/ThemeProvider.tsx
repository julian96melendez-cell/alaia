// app/ThemeProvider.tsx
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import React, { ReactNode, useMemo } from "react";
import { useColorScheme } from "react-native";

/**
 * 🎨 Paleta personalizada de colores
 * Puedes ajustar esto según el estilo visual de tu app.
 */
const LightColors = {
  background: "#FFFFFF",
  card: "#F8F9FA",
  text: "#111827",
  border: "#E5E7EB",
  primary: "#2563EB",
};

const DarkColors = {
  background: "#0F172A",
  card: "#1E293B",
  text: "#F1F5F9",
  border: "#334155",
  primary: "#3B82F6",
};

type Props = {
  children: ReactNode;
};

/**
 * 🌙 ThemeProvider global de la app
 * - Detecta automáticamente el modo claro/oscuro.
 * - Se integra con React Navigation.
 * - Ofrece una paleta profesional y escalable.
 */
export default function ThemeProvider({ children }: Props) {
  const scheme = useColorScheme(); // "light" | "dark"

  // Usamos useMemo para mejorar el rendimiento al recalcular el tema
  const theme = useMemo(() => {
    const baseTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
    const customColors = scheme === "dark" ? DarkColors : LightColors;

    return {
      ...baseTheme,
      dark: scheme === "dark",
      colors: {
        ...baseTheme.colors,
        ...customColors,
      },
    };
  }, [scheme]);

  return (
    <NavigationThemeProvider value={theme}>
      {children}
    </NavigationThemeProvider>
  );
}