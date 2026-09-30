"use client";

import { ChangeEvent, useRef, useState } from "react";

type Props = {
  value?: string;
  onChange: (uri: string) => void;
  size?: number;
};

export default function AvatarPicker({
  value,
  onChange,
  size = 120,
}: Props) {
  const [preview, setPreview] = useState<string | undefined>(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlePick = () => {
    inputRef.current?.click();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    onChange(objectUrl);
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
      <div
        onClick={handlePick}
        style={{
          position: "relative",
          width: size,
          height: size,
          cursor: "pointer",
        }}
      >
        <img
          src={preview || "https://cdn-icons-png.flaticon.com/512/147/147144.png"}
          alt="Avatar"
          style={{
            width: size,
            height: size,
            borderRadius: "999px",
            border: "3px solid #111",
            objectFit: "cover",
            display: "block",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: 4,
            bottom: 4,
            width: 34,
            height: 34,
            borderRadius: "999px",
            backgroundColor: "#111",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          📷
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}