export function useColorScheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  return dark ? "dark" : "light";
}