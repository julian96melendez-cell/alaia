"use client";

import React from "react";

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export type TextProps = ThemeProps & React.HTMLAttributes<HTMLSpanElement>;
export type ViewProps = ThemeProps & React.HTMLAttributes<HTMLDivElement>;

function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: "text" | "background"
) {
  const theme = "light"; // luego puedes conectar tu hook real
  const colorFromProps = props[theme];

  if (colorFromProps) return colorFromProps;

  return Colors[theme][colorName];
}

export function Text({
  style,
  lightColor,
  darkColor,
  children,
  ...props
}: TextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");

  return (
    <span
      {...props}
      style={{
        color,
        ...(style || {}),
      }}
    >
      {children}
    </span>
  );
}

export function View({
  style,
  lightColor,
  darkColor,
  children,
  ...props
}: ViewProps) {
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "background"
  );

  return (
    <div
      {...props}
      style={{
        backgroundColor,
        ...(style || {}),
      }}
    >
      {children}
    </div>
  );
}

const Colors = {
  light: {
    text: "#000",
    background: "#fff",
  },
  dark: {
    text: "#fff",
    background: "#000",
  },
};