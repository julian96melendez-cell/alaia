"use client";

import React from "react";
import useTheme from "../../hooks/useTheme";

type Variant = "primary" | "secondary" | "ghost" | "link";
type Size = "sm" | "md" | "lg";

interface ProButtonProps {
  title: string;
  onPress?: () => void;
  icon?: string;
  iconPosition?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
  testID?: string;
}

const ProButton: React.FC<ProButtonProps> = ({
  title,
  onPress,
  icon,
  iconPosition = "left",
  loading = false,
  disabled = false,
  variant = "primary",
  size = "md",
  fullWidth = false,
  style,
  textStyle,
  testID,
}) => {
  const { theme } = useTheme();

  const getSizing = () => {
    switch (size) {
      case "sm":
        return { padding: "8px 16px", fontSize: 14 };
      case "lg":
        return { padding: "16px 28px", fontSize: 18 };
      default:
        return { padding: "12px 22px", fontSize: 16 };
    }
  };

  const { padding, fontSize } = getSizing();

  const backgroundColors: Record<Variant, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.card,
    ghost: "transparent",
    link: "transparent",
  };

  const textColors: Record<Variant, string> = {
    primary: theme.colors.background,
    secondary: theme.colors.text,
    ghost: theme.colors.text,
    link: theme.colors.primary,
  };

  const borderColors: Record<Variant, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.border,
    ghost: "transparent",
    link: "transparent",
  };

  return (
    <button
      data-testid={testID}
      type="button"
      onClick={onPress}
      disabled={disabled || loading}
      style={{
        width: fullWidth ? "100%" : "auto",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding,
        borderRadius: 14,
        border: variant === "secondary" ? `1.5px solid ${borderColors[variant]}` : "none",
        background: backgroundColors[variant],
        color: textColors[variant],
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
        fontWeight: 700,
        letterSpacing: "0.3px",
        fontSize,
        transition: "transform 0.15s ease, opacity 0.15s ease",
        ...style,
      }}
    >
      {loading ? (
        <span style={{ ...textStyle }}>Cargando...</span>
      ) : (
        <>
          {icon && iconPosition === "left" ? <span>{icon}</span> : null}
          <span style={textStyle}>{title}</span>
          {icon && iconPosition === "right" ? <span>{icon}</span> : null}
        </>
      )}
    </button>
  );
};

export default ProButton;