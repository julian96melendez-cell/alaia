import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { ROUTES } from "./routes";

export function useAppNavigation() {
  const router = useRouter();

  const push = (path: string, fallback = ROUTES.home) => {
    try {
      router.push(path as any);
    } catch {
      router.replace(fallback as any);
    }
  };

  const replace = (path: string, fallback = ROUTES.home) => {
    try {
      router.replace(path as any);
    } catch {
      router.replace(fallback as any);
    }
  };

  const back = (fallback: string = ROUTES.home) => {
    try {
      if ((router as any).canGoBack?.()) {
        router.back();
      } else {
        router.replace(fallback as any);
      }
    } catch {
      router.replace(fallback as any);
    }
  };

  const comingSoon = (title = "Próximamente") => {
    Alert.alert(title, "Esta función estará disponible pronto.");
  };

  return {
    router,
    routes: ROUTES,
    push,
    replace,
    back,
    comingSoon,
  };
}