"use client";


export default function AdminLoader({ text = "Cargando…" }: { text?: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f7f8",
        color: "#555",
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}