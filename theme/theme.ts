// 📦 theme/theme.ts
// 🎨 Sistema de temas centralizado — claro y oscuro — compatible con ThemeProvider

export type ColorPalette = {
  background: string;
  card: string;
  text: string;
  border: string;
  primary: string;
};

export type AppTheme = {
  dark: boolean;
  colors: ColorPalette;
};

// 🎨 Paleta clara (modo por defecto)
export const LightTheme: AppTheme = {
  dark: false,
  colors: {
    background: "#FFFFFF",
    card: "#F9FAFB",
    text: "#111827",
    border: "#E5E7EB",
    primary: "#6C63FF",
  },
};

// 🌙 Paleta oscura
export const DarkTheme: AppTheme = {
  dark: true,
  colors: {
    background: "#0F172A",
    card: "#1E293B",
    text: "#F8FAFC",
    border: "#334155",
    primary: "#818CF8",
  },
};

// 🧠 Exportamos un objeto Colors para usar en todo el proyecto
const Colors = {
  light: LightTheme.colors,
  dark: DarkTheme.colors,
};

export default Colors;