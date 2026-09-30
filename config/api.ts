// One API origin for mobile catalog, tracking, orders and checkout.
const configuredUrl = (process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "").trim();
const baseUrl = configuredUrl || (__DEV__ ? "http://localhost:3001" : "");
if (!baseUrl) throw new Error("Configura EXPO_PUBLIC_BACKEND_URL para la app móvil");
const parsedUrl = new URL(baseUrl);
if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
  throw new Error("La URL de API debe ser HTTP(S), sin credenciales ni parámetros");
}
if (!__DEV__ && parsedUrl.protocol !== "https:") throw new Error("La API de producción debe usar HTTPS");
export const API_BASE_URL = baseUrl.replace(/\/+$/, "");
