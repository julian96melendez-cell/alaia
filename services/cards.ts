// services/cards.ts
// Centro de datos "dummy" para Home, categorías y productos destacados

// 🔹 Slugs que usaremos en rutas tipo /category/[slug]
export type CategorySlug = "tecnologia" | "salud" | "hogar" | "belleza" | "ropa";

// 🔹 Tarjeta de categoría para el Home
export type HomeCategoryCard = {
  id: string;
  title: string;
  slug: CategorySlug;
  icon: string;        // Nombre del ícono Ionicons (ej: "home-outline")
};

// 🔹 Tarjeta de producto destacado
export type HomeProductCard = {
  id: string;
  title: string;
  price: number;
  image: string;       // URL de imagen (o require local si quieres luego)
  categorySlug: CategorySlug;
  badgeLabel?: string; // Ej: "Nuevo", "Top ventas"
  isNew?: boolean;
  isLimited?: boolean;
};

// ---------------------------------------------------------------------
// CATEGORÍAS PARA EL HOME
// ---------------------------------------------------------------------

export const HOME_CATEGORIES: HomeCategoryCard[] = [
  {
    id: "cat-tecno",
    title: "Tecnología",
    slug: "tecnologia",
    icon: "laptop-outline",
  },
  {
    id: "cat-salud",
    title: "Salud",
    slug: "salud",
    icon: "fitness-outline",
  },
  {
    id: "cat-hogar",
    title: "Hogar",
    slug: "hogar",
    icon: "home-outline",
  },
  {
    id: "cat-belleza",
    title: "Belleza",
    slug: "belleza",
    icon: "sparkles-outline",
  },
  {
    id: "cat-ropa",
    title: "Ropa",
    slug: "ropa",
    icon: "shirt-outline",
  },
];

// ---------------------------------------------------------------------
// PRODUCTOS DESTACADOS DEL HOME
// ---------------------------------------------------------------------

export const HOME_FEATURED_PRODUCTS: HomeProductCard[] = [
  {
    id: "prod-smartwatch-pro",
    title: "Smartwatch Pro",
    price: 129,
    image: "https://i.imgur.com/UYiroysl.jpg",
    categorySlug: "tecnologia",
    badgeLabel: "Nuevo",
    isNew: true,
  },
  {
    id: "prod-air-max",
    title: "Audífonos Air Max",
    price: 199,
    image: "https://i.imgur.com/t6nQKFFl.jpg",
    categorySlug: "tecnologia",
    badgeLabel: "Top ventas",
    isLimited: true,
  },
  {
    id: "prod-sneaker-x",
    title: "Sneakers Alaïa X",
    price: 89,
    image: "https://i.imgur.com/DvpvklR.png",
    categorySlug: "ropa",
    badgeLabel: "Colección 2024",
  },
];

// ---------------------------------------------------------------------
// UTILIDAD: formatear precio
// ---------------------------------------------------------------------

export function formatPrice(value: number): string {
  if (Number.isNaN(value)) return "$0.00";
  return `$${value.toFixed(2)}`;
}