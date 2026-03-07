// utils/cleanUrl.ts

/**
 * Limpia una URL eliminando username y password
 * evitando errores en React Native (Expo).
 */
export function cleanUrl(href: string): string {
  try {
    const originalUrl = new URL(href);

    // reconstruir sin credenciales
    const finalUrl =
      originalUrl.origin +
      originalUrl.pathname +
      originalUrl.search +
      originalUrl.hash;

    return finalUrl;
  } catch (error) {
    console.warn("URL inválida:", href);
    return href; // devuelve la original si falla
  }
}