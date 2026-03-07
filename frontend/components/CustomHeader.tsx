"use client";


interface Props {
  title?: string;
}

export default function CustomHeader({ title }: Props) {
  return (
    <div
      style={{
        width: "100%",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #e5e5e5",
        fontWeight: 600,
        fontSize: 18,
      }}
    >
      <span>{title || "Alaia"}</span>
    </div>
  );
}