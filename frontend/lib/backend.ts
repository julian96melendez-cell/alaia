// Shared by Next client and server consumers; configure at build time.
const configuredUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "").trim();
const development = process.env.NODE_ENV === "development";
const baseUrl = configuredUrl || (development ? "http://localhost:3001" : "");
if (!baseUrl) throw new Error("Configura NEXT_PUBLIC_BACKEND_URL para Next.js");
const parsedUrl = new URL(baseUrl);
if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash || parsedUrl.pathname !== "/") {
  throw new Error("NEXT_PUBLIC_BACKEND_URL debe ser un origen HTTP(S), sin ruta, credenciales ni parámetros");
}
if (!development && (parsedUrl.protocol !== "https:" || /^(localhost|127\.|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?)/i.test(parsedUrl.hostname))) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL de producción debe ser un origen HTTPS público");
}
export const API_BASE_URL = parsedUrl.origin;
export function apiUrl(path: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) throw new Error("La ruta de API debe ser relativa al backend");
  return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}
