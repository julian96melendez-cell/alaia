"use client";


type Props = {
  name: string;
  focused: boolean;
  size?: number;
};

function mapIcon(name: string) {
  switch (name) {
    case "home":
    case "home-outline":
      return "⌂";
    case "search":
    case "search-outline":
      return "⌕";
    case "cart":
    case "cart-outline":
      return "🛒";
    case "heart":
    case "heart-outline":
      return "♡";
    case "person":
    case "person-outline":
      return "👤";
    case "settings":
    case "settings-outline":
      return "⚙";
    default:
      return "•";
  }
}

export default function TabBarIcon({ name, focused, size = 22 }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size,
        lineHeight: 1,
        color: focused ? "#4F46E5" : "rgba(0,0,0,0.45)",
        marginBottom: -2,
      }}
    >
      {mapIcon(name)}
    </span>
  );
}