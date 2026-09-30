export const ROUTES = {
  home: "/(tabs)",
  profile: "/(tabs)/profile",
  orders: "/(tabs)/orders",
  cart: "/(tabs)/cart",
  notifications: "/(tabs)/notifications",
  wishlist: "/(tabs)/wishlist",
  settings: "/(tabs)/settings",

  profileInfo: "/profile-info",
  modal: "/modal",
  error: "/error",

  track: (ordenId: string) => `/track/${ordenId}`,
  product: (id: string) => `/product/${id}`,
  category: (slug: string) => `/category/${slug}`,
} as const;

export type AppRouteKey = keyof typeof ROUTES;