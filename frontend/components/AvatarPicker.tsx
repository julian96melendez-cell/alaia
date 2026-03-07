import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, Image, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import useTheme from "../../hooks/useTheme";

type Props = {
  value?: string;
  onChange: (uri: string) => void;
  size?: number;
};

export default function AvatarPicker({ value, onChange, size = 120 }: Props) {
  const { theme } = useTheme();
  const [localUri, setLocalUri] = useState<string | undefined>(value);

  const pickImage = async () => {
    // iOS requiere pedir permiso explícito; en Android el selector lo maneja el SO.
    if (Platform.OS === "ios") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Necesitas permitir acceso a la galería.");
        return;
      }
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!res.canceled) {
      const uri = res.assets[0].uri;
      setLocalUri(uri);
      onChange(uri);
    }
  };

  return (
    <TouchableOpacity onPress={pickImage} style={{ alignSelf: "center", marginBottom: 24 }}>
      <View style={{ width: size, height: size }}>
        <Image
          source={{
            uri:
              localUri ||
              "https://cdn-icons-png.flaticon.com/512/147/147144.png",
          }}
          style={[styles.avatar, { width: size, height: size, borderColor: theme.colors.primary }]}
        />
        <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
          <Ionicons name="camera" size={18} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatar: { borderRadius: 999, borderWidth: 3 },
  badge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
});