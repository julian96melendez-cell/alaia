"use client";

import React, { useState } from "react";
import useTheme from "../../hooks/useTheme";

interface ProInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  secure?: boolean;
  errorText?: string;
}

export default function ProInput({
  label,
  icon,
  secure = false,
  errorText,
  style,
  ...props
}: ProInputProps) {
  const { colors } = useTheme();
  const [isSecure, setIsSecure] = useState(secure);
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ margin: "10px 0" }}>
      {label ? (
        <label
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
            color: colors.text,
          }}
        >
          {label}
        </label>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: `1.5px solid ${
            errorText ? colors.error : focused ? colors.tint : colors.border
          }`,
          borderRadius: 12,
          padding: "10px 12px",
          backgroundColor: colors.card,
        }}
      >
        {icon ? (
          <span style={{ color: errorText ? colors.error : colors.textSecondary || "#9CA3AF" }}>
            {icon}
          </span>
        ) : null}

        <input
          {...props}
          type={isSecure ? "password" : props.type || "text"}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={{
            flex: 1,
            fontSize: 16,
            border: "none",
            outline: "none",
            background: "transparent",
            color: colors.text,
            ...(style as React.CSSProperties),
          }}
        />

        {secure ? (
          <button
            type="button"
            onClick={() => setIsSecure(!isSecure)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: colors.textSecondary || "#9CA3AF",
            }}
          >
            {isSecure ? "🙈" : "👁"}
          </button>
        ) : null}
      </div>

      {errorText ? (
        <div
          style={{
            fontSize: 12,
            marginTop: 4,
            color: colors.error,
          }}
        >
          {errorText}
        </div>
      ) : null}
    </div>
  );
}