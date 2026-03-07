// constants/Colors.ts
export const Colors = {
  light: {
    primary: "#6C63FF",
    primaryLight: "#8B85FF",
    primaryDark: "#4F46E5",
    background: "#F9FAFB",
    backgroundSecondary: "#FFFFFF",
    card: "#FFFFFF",
    text: "#1E293B",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    border: "#E2E8F0",
    tint: "#6C63FF",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#3B82F6",
    shadow: "rgba(0,0,0,0.08)",
    overlay: "rgba(0,0,0,0.5)",
  },
  dark: {
    primary: "#6C63FF",
    primaryLight: "#8B85FF",
    primaryDark: "#4F46E5",
    background: "#0F172A",
    backgroundSecondary: "#1E293B",
    card: "#1E293B",
    text: "#F1F5F9",
    textSecondary: "#CBD5E1",
    textMuted: "#94A3B8",
    border: "#334155",
    tint: "#8B85FF",
    success: "#22C55E",
    warning: "#FACC15",
    error: "#F87171",
    info: "#60A5FA",
    shadow: "rgba(255,255,255,0.05)",
    overlay: "rgba(0,0,0,0.6)",
  },
};

export const Typography = {
  title1: { fontSize: 28, fontWeight: "700" as const },
  title2: { fontSize: 22, fontWeight: "600" as const },
  subtitle: { fontSize: 18, fontWeight: "500" as const },
  body:    { fontSize: 16, fontWeight: "400" as const },
  caption: { fontSize: 14, fontWeight: "400" as const },
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const Radius  = { sm: 8, md: 14, lg: 20, xl: 28 };

export const Shadows = {
  light: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
  },
  dark: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.4,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
  },
};

// ✅ Export default para imports existentes: `import Colors from ...`
export default Colors;