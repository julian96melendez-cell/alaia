"use client";


type Props = {
  label?: string;
};

export default function Loading({ label = "Cargando..." }: Props) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        padding: "40px",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          border: "4px solid #e5e7eb",
          borderTop: "4px solid #6366f1",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />

      <span style={{ opacity: 0.7 }}>{label}</span>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}