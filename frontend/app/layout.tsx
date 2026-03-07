import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alaia Admin",
  description: "Panel de administración",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}