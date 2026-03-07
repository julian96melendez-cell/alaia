import React from "react";
import {
  Text as DefaultText,
  View as DefaultView,
  TextProps as DefaultTextProps,
  ViewProps as DefaultViewProps,
} from "react-native";

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultTextProps;
export type ViewProps = ThemeProps & DefaultViewProps;

function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: "text" | "background"
) {
  const theme = "light"; // Puedes reemplazarlo luego por un hook real
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  }

  return Colors[theme][colorName];
}

export function Text(props: TextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");

  return <DefaultText style={[{ color }, style]} {...otherProps} />;
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "background"
  );

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}

// 🎨 Paleta de colores
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