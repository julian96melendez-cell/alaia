import { Ionicons } from "@expo/vector-icons";
import React from "react";

type Props = {
  name: React.ComponentProps<typeof Ionicons>["name"];
  focused: boolean;
  size?: number;
};

export default function TabBarIcon({ name, focused, size = 22 }: Props) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={focused ? "#4F46E5" : "rgba(0,0,0,0.45)"}
      style={{ marginBottom: -2 }}
    />
  );
}