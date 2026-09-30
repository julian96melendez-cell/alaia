import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

type BackButtonProps = {
  fallback?: string;
};

export default function BackButton({
  fallback = "/(tabs)/profile",
}: BackButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    try {
      if ((router as any).canGoBack?.()) {
        router.back();
        return;
      }

      router.replace(fallback as any);
    } catch {
      router.replace(fallback as any);
    }
  };

  return (
    <Pressable onPress={handlePress} style={styles.button}>
      <Ionicons name="chevron-back" size={24} color="#111827" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
});