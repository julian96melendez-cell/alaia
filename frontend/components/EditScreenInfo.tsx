"use client";

type Props = {
  path: string;
};

export default function EditScreenInfo({ path }: Props) {
  return (
    <div
      style={{
        textAlign: "center",
        margin: "20px",
        fontSize: "16px",
        lineHeight: "24px",
      }}
    >
      Abre este archivo:{" "}
      <span style={{ fontWeight: "bold" }}>{path}</span> para empezar a editar.
    </div>
  );
}