"use client";


type ButtonProps = {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  fullWidth?: boolean;
  className?: string;
};

export default function Button({
  title,
  onClick,
  disabled = false,
  loading = false,
  type = "button",
  fullWidth = true,
  className = "",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: fullWidth ? "100%" : "auto",
        padding: "12px 18px",
        borderRadius: "12px",
        border: "none",
        fontWeight: 600,
        fontSize: "15px",
        cursor: disabled ? "not-allowed" : "pointer",
        backgroundColor: disabled ? "#9ca3af" : "#6366f1",
        color: "#ffffff",
        transition: "all 0.2s ease",
      }}
      className={className}
    >
      {loading ? "Loading..." : title}
    </button>
  );
}