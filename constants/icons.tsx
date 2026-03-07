import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";

type IconProps = {
  color: string;
  size: number;
};

const AppIcons = {
  home: ({ color, size }: IconProps) => (
    <Ionicons name="home-outline" size={size} color={color} />
  ),

  cart: ({ color, size }: IconProps) => (
    <Ionicons name="cart-outline" size={size} color={color} />
  ),

  one: ({ color, size }: IconProps) => (
    <MaterialCommunityIcons
      name="numeric-1-circle-outline"
      size={size}
      color={color}
    />
  ),

  two: ({ color, size }: IconProps) => (
    <MaterialCommunityIcons
      name="numeric-2-circle-outline"
      size={size}
      color={color}
    />
  ),

  wishlist: ({ color, size }: IconProps) => (
    <Ionicons name="heart-outline" size={size} color={color} />
  ),

  profile: ({ color, size }: IconProps) => (
    <Ionicons name="person-outline" size={size} color={color} />
  ),

  settings: ({ color, size }: IconProps) => (
    <Ionicons name="settings-outline" size={size} color={color} />
  ),
};

export default AppIcons;