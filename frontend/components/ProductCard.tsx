"use client";

import useTheme from "../../hooks/useTheme";

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    price: number;
    image: string;
    brand?: string;
    description?: string;
  };
  onPress: () => void;
  onWishlist?: () => void;
}

export default function ProductCard({
  product,
  onPress,
  onWishlist,
}: ProductCardProps) {
  const { theme } = useTheme();

  return (
    <div
      onClick={onPress}
      style={{
        width: "100%",
        maxWidth: 260,
        borderRadius: 16,
        margin: "10px 8px",
        overflow: "hidden",
        cursor: "pointer",
        backgroundColor: theme.card,
        boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: 150,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <img
          src={
            product.image ||
            "https://cdn.pixabay.com/photo/2016/11/19/14/00/shoes-1838769_1280.jpg"
          }
          alt={product.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onWishlist?.();
          }}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            borderRadius: 999,
            padding: "8px 10px",
            border: "none",
            backgroundColor: theme.card,
            cursor: "pointer",
            boxShadow: "0 1px 6px rgba(0,0,0,0.1)",
          }}
        >
          ♡
        </button>
      </div>

      <div style={{ padding: 10 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: theme.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {product.name}
        </div>

        <div
          style={{
            fontSize: 13,
            margin: "2px 0",
            color: theme.subtext,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {product.brand || "Marca genérica"}
        </div>

        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginTop: 6,
            color: theme.tint,
          }}
        >
          ${product.price.toFixed(2)}
        </div>
      </div>
    </div>
  );
}