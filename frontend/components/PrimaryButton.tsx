"use client";

import React from "react";
import useTheme from "../../hooks/useTheme";

interface PrimaryButtonProps {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  glass?: boolean;
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
  fullWidth?: boolean;
}

const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  glass = false,
  style,
  textStyle,
  fullWidth = true,
}) => {
  const { theme, isDarkMode } = useTheme();

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled || loading}
      style={{
        width: fullWidth ? "100%" : "auto",
        padding: "14px 22px",
        borderRadius: 14,
        border: `1.2px solid ${glass ? theme.colors.border : "transparent"}`,
        background: glass
          ? isDarkMode
            ? "rgba(255,255,255,0.06)"
            : "rgba(255,255,255,0.4)"
          : theme.colors.primary,
        color: glass ? theme.colors.text : "#fff",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: "0.4px",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        backdropFilter: glass ? "blur(10px)" : undefined,
        WebkitBackdropFilter: glass ? "blur(10px)" : undefined,
        boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
        ...style,
      }}
    >
      <span style={textStyle}>{loading ? "Cargando..." : title}</span>
    </button>
  );
};

export default PrimaryButton;