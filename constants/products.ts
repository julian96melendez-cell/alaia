// 📦 constants/products.ts
// 🛍️ Catálogo de productos moderno y escalable

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
  description: string;
  rating: number;
  reviews: number;
  stock: number;
  colors?: string[];
  sizes?: string[];
  isFeatured?: boolean;
}

export const products: Product[] = [
  {
    id: "p1",
    name: "Camiseta Premium Algodón Orgánico",
    price: 29.99,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
    category: "Ropa",
    description:
      "Camiseta unisex de algodón orgánico con ajuste moderno y tacto suave. Perfecta para el uso diario.",
    rating: 4.8,
    reviews: 126,
    stock: 42,
    colors: ["#000000", "#FFFFFF", "#6C63FF"],
    sizes: ["S", "M", "L", "XL"],
    isFeatured: true,
  },
  {
    id: "p2",
    name: "Auriculares Bluetooth Pro X",
    price: 89.99,
    image: "https://images.unsplash.com/photo-1580894908361-967195033215?w=800",
    category: "Tecnología",
    description:
      "Auriculares inalámbricos con cancelación activa de ruido, batería de 30 h y carga rápida.",
    rating: 4.6,
    reviews: 312,
    stock: 78,
    colors: ["#000000", "#FFFFFF"],
    isFeatured: true,
  },
  {
    id: "p3",
    name: "Lámpara Minimalista LED",
    price: 49.99,
    image: "https://images.unsplash.com/photo-1606813902911-8a9fdd9af099?w=800",
    category: "Hogar",
    description:
      "Lámpara de mesa LED con diseño minimalista y regulador táctil de intensidad. Ideal para tu espacio de trabajo o dormitorio.",
    rating: 4.7,
    reviews: 89,
    stock: 33,
    colors: ["#FFFFFF", "#F5F5F5"],
    isFeatured: false,
  },
  {
    id: "p4",
    name: "Bolso de Cuero Clásico",
    price: 119.99,
    image: "https://images.unsplash.com/photo-1593032465171-8b0c8f5252a8?w=800",
    category: "Accesorios",
    description:
      "Bolso de cuero genuino con diseño atemporal y amplio espacio interior. Hecho a mano con materiales de alta calidad.",
    rating: 4.9,
    reviews: 204,
    stock: 15,
    colors: ["#5A3825", "#000000"],
    isFeatured: true,
  },
  {
    id: "p5",
    name: "Zapatillas Urban Street",
    price: 79.99,
    image: "https://images.unsplash.com/photo-1600185365683-3e6a0e76d50e?w=800",
    category: "Ropa",
    description:
      "Zapatillas ligeras con suela de goma antideslizante, diseñadas para brindar confort y estilo urbano.",
    rating: 4.5,
    reviews: 150,
    stock: 60,
    colors: ["#FFFFFF", "#6C63FF", "#000000"],
    sizes: ["38", "39", "40", "41", "42"],
    isFeatured: false,
  },
  {
    id: "p6",
    name: "Smartwatch Active Fit",
    price: 139.99,
    image: "https://images.unsplash.com/photo-1606813902899-26e8a6f1a8d7?w=800",
    category: "Tecnología",
    description:
      "Reloj inteligente con monitor de frecuencia cardíaca, GPS, resistencia al agua y pantalla AMOLED.",
    rating: 4.8,
    reviews: 298,
    stock: 25,
    colors: ["#6C63FF", "#000000"],
    isFeatured: true,
  },
];