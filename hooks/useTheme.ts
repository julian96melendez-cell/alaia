// hooks/useTheme.ts
import { useThemeContext } from "../frontend/context/ThemeContext";

export default function useTheme() {
  const { colors, isDarkMode, toggleTheme } = useThemeContext();

  /**
   * Sistema profesional:
   * - theme: objeto completo (theme.background, theme.text, theme.card...)
   * - theme.colors: igual que antes (theme.colors.text)
   * - colors: acceso directo para nuevas pantallas
   */
  const theme = {
    ...colors,
    colors, // Compatibilidad TOTAL con todas tus pantallas
  };

  return {
    colors,
    theme,
    isDarkMode,
    toggleTheme,
  };
}