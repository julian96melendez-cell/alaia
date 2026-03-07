// screens/ProfileScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { updateProfile } from "firebase/auth";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
  UploadTask,
} from "firebase/storage";

import { useAuth } from "../context/AuthContext";
import { auth, storage } from "../firebase/firebaseConfig";
import useTheme from "../hooks/useTheme";

type RowButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
};

const RowButton: React.FC<RowButtonProps> = ({
  icon,
  label,
  onPress,
  trailing,
}) => {
  const { colors, isDarkMode } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        styles.rowBtn,
        {
          backgroundColor: colors.card,
          borderColor: isDarkMode ? "#233046" : "#E5E7EB",
        },
      ]}
      accessibilityRole="button"
    >
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      </View>
      {trailing ?? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary || "#94A3B8"}
        />
      )}
    </TouchableOpacity>
  );
};

export default function ProfileScreen() {
  const { colors, isDarkMode, toggleTheme } = useTheme();
  const { user, logout, updateUserProfile } = useAuth();

  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [displayName, setDisplayName] = useState<string>(
    user?.displayName || ""
  );
  const [localPhoto, setLocalPhoto] = useState<string | undefined>(undefined);

  // Upload state
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [uploading, setUploading] = useState<boolean>(false);
  const uploadTaskRef = useRef<UploadTask | null>(null);

  // Iniciales avatar
  const initials = useMemo(() => {
    const name = user?.displayName || user?.email || "Usuario";
    const parts = (name ?? "").split(" ").filter(Boolean);
    return `${(parts[0]?.[0] || "U").toUpperCase()}${(
      parts[1]?.[0] || ""
    ).toUpperCase()}`;
  }, [user?.displayName, user?.email]);

  // Switch animado de tema
  const knobX = useRef(new Animated.Value(isDarkMode ? 18 : 0)).current;
  useEffect(() => {
    Animated.timing(knobX, {
      toValue: isDarkMode ? 18 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isDarkMode, knobX]);

  /* ─────────────── acciones / helpers ─────────────── */

  const requestGalleryPermissions = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert(
        "Permiso denegado",
        "Necesitas permitir acceso a la galería para cambiar tu foto."
      );
      return false;
    }
    return true;
  }, []);

  const pickNewPhoto = useCallback(async () => {
    const ok = await requestGalleryPermissions();
    if (!ok) return;

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (!res.canceled) {
      setLocalPhoto(res.assets[0]?.uri);
      setEditOpen(true);
    }
  }, [requestGalleryPermissions]);

  const uploadAvatarToStorage = useCallback(
    async (uri: string, uid: string): Promise<string> => {
      const response = await fetch(uri);
      const blob = await response.blob();
      const key = `users/${uid}/avatar.jpg`;
      const ref = storageRef(storage, key);

      return new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(ref, blob, {
          cacheControl: "public,max-age=31536000,immutable",
          contentType: blob.type || "image/jpeg",
        });

        uploadTaskRef.current = task;
        setUploading(true);
        setUploadPct(0);

        task.on(
          "state_changed",
          (snap) => {
            if (snap.totalBytes > 0) {
              const pct = Math.round(
                (snap.bytesTransferred / snap.totalBytes) * 100
              );
              setUploadPct(pct);
            }
          },
          (err) => {
            setUploading(false);
            setUploadPct(0);
            uploadTaskRef.current = null;
            reject(err);
          },
          async () => {
            try {
              const url = await getDownloadURL(ref);
              setUploading(false);
              setUploadPct(100);
              uploadTaskRef.current = null;
              resolve(url);
            } catch (e) {
              setUploading(false);
              setUploadPct(0);
              uploadTaskRef.current = null;
              reject(e);
            }
          }
        );
      });
    },
    []
  );

  const cancelUpload = useCallback(() => {
    try {
      uploadTaskRef.current?.cancel();
    } catch {
      // no-op
    }
  }, []);

  // Cancelar subida si se desmonta la pantalla
  useEffect(() => {
    return () => {
      cancelUpload();
    };
  }, [cancelUpload]);

  const onSaveProfile = useCallback(async () => {
    const name = displayName.trim();
    if (!name) {
      Alert.alert("Nombre requerido", "Ingresa un nombre válido.");
      return;
    }

    try {
      let newPhotoURL: string | undefined;

      if (localPhoto && user?.uid) {
        try {
          newPhotoURL = await uploadAvatarToStorage(localPhoto, user.uid);
        } catch (e: any) {
          if (e?.code === "storage/canceled") {
            Alert.alert("Cancelado", "Se canceló la subida de imagen.");
            return;
          }
          Alert.alert("Error al subir imagen", "Intenta nuevamente.");
          return;
        }
      }

      if (updateUserProfile) {
        await updateUserProfile(name, newPhotoURL ?? undefined);
      } else if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name,
          photoURL: newPhotoURL ?? auth.currentUser.photoURL ?? undefined,
        });
      }

      setEditOpen(false);
      setLocalPhoto(undefined);
      Alert.alert(
        "Perfil actualizado",
        "Tus datos fueron actualizados correctamente."
      );
    } catch {
      Alert.alert("Error", "No se pudo actualizar el perfil. Intenta de nuevo.");
    }
  }, [
    displayName,
    localPhoto,
    updateUserProfile,
    uploadAvatarToStorage,
    user?.uid,
  ]);

  const onRemovePhoto = useCallback(() => {
    if (!user?.uid) {
      setLocalPhoto(undefined);
      return;
    }
    Alert.alert("Quitar foto", "¿Deseas eliminar tu foto de perfil?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            try {
              const ref = storageRef(storage, `users/${user.uid}/avatar.jpg`);
              await deleteObject(ref);
            } catch {
              // Ignorar si no existe
            }

            if (updateUserProfile) {
              await updateUserProfile(user.displayName || "", "");
            } else if (auth.currentUser) {
              await updateProfile(auth.currentUser, { photoURL: "" });
            }
            setLocalPhoto(undefined);
            Alert.alert("Listo", "Se quitó tu foto de perfil.");
          } catch {
            Alert.alert("Error", "No se pudo quitar la foto.");
          }
        },
      },
    ]);
  }, [updateUserProfile, user?.displayName, user?.uid]);

  const onLogout = useCallback(() => {
    Alert.alert("Cerrar sesión", "¿Deseas cerrar sesión ahora?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch {
            Alert.alert("Error", "No se pudo cerrar la sesión.");
          }
        },
      },
    ]);
  }, [logout]);

  /* ─────────────── UI ─────────────── */

  const currentAvatar = localPhoto || user?.photoURL;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Perfil
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        {/* Tarjeta de usuario */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.userRow}>
            <TouchableOpacity
              onPress={pickNewPhoto}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              {currentAvatar ? (
                <Image source={{ uri: currentAvatar }} style={styles.avatarImg} />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: (colors.primary || "#6C63FF") + "22" },
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarTxt,
                      { color: colors.primary },
                    ]}
                  >
                    {initials}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>
                {user?.displayName || "Usuario"}
              </Text>
              {!!user?.email && (
                <Text
                  style={[
                    styles.email,
                    { color: colors.textSecondary || "#6B7280" },
                  ]}
                >
                  {user.email}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.editBtn, { backgroundColor: colors.primary }]}
              onPress={() => setEditOpen(true)}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              <Ionicons name="pencil" size={16} color="#fff" />
              <Text style={styles.editBtnText}>Editar</Text>
            </TouchableOpacity>
          </View>

          {currentAvatar && (
            <TouchableOpacity
              onPress={onRemovePhoto}
              style={styles.removePhoto}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
              <Text
                style={{
                  color: "#ef4444",
                  fontWeight: "800",
                  fontSize: 12,
                }}
              >
                Quitar foto
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Accesos rápidos */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Mi cuenta
        </Text>
        <RowButton
          icon="receipt-outline"
          label="Mis pedidos"
          onPress={() => {
            // TODO: navegación a pantalla de pedidos
          }}
        />
        <RowButton
          icon="heart-outline"
          label="Wishlist"
          onPress={() => {
            // TODO: navegación a wishlist
          }}
        />
        <RowButton
          icon="location-outline"
          label="Direcciones"
          onPress={() =>
            Alert.alert(
              "Próximamente",
              "Pantalla de direcciones en preparación."
            )
          }
        />

        {/* Preferencias */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Preferencias
        </Text>
        <RowButton
          icon={isDarkMode ? "sunny-outline" : "moon-outline"}
          label={isDarkMode ? "Tema claro" : "Tema oscuro"}
          onPress={toggleTheme}
          trailing={
            <View
              style={[
                styles.switchPill,
                {
                  borderColor: isDarkMode ? "#334155" : "#E5E7EB",
                  backgroundColor: isDarkMode ? "#0B1220" : "#FFFFFF",
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.switchDot,
                  {
                    backgroundColor: colors.primary,
                    transform: [{ translateX: knobX }],
                  },
                ]}
              />
            </View>
          }
        />
        <RowButton
          icon="notifications-outline"
          label="Notificaciones"
          onPress={() =>
            Alert.alert(
              "Próximamente",
              "Preferencias de notificaciones en preparación."
            )
          }
        />

        {/* Soporte */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Soporte
        </Text>
        <RowButton
          icon="help-circle-outline"
          label="Centro de ayuda"
          onPress={() =>
            Alert.alert("Ayuda", "Escríbenos a support@alaia.app")
          }
        />
        <RowButton
          icon="shield-checkmark-outline"
          label="Privacidad y seguridad"
          onPress={() =>
            Alert.alert(
              "Privacidad",
              "Política de privacidad próximamente."
            )
          }
        />

        {/* Cerrar sesión */}
        <TouchableOpacity
          onPress={onLogout}
          activeOpacity={0.9}
          style={[
            styles.logoutBtn,
            {
              backgroundColor: isDarkMode ? "#1F2937" : "#FEE2E2",
              borderColor: isDarkMode ? "#374151" : "#FCA5A5",
            },
          ]}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={18} color="#B91C1C" />
          <Text style={styles.logoutTxt}>Cerrar sesión</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={{ alignItems: "center", marginTop: 10 }}>
          <Text
            style={{
              fontSize: 12,
              color: colors.textSecondary || "#94A3B8",
            }}
          >
            ALAÏA • v1.0.0
          </Text>
        </View>
      </ScrollView>

      {/* Modal editar perfil */}
      <Modal
        visible={editOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setEditOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Editar perfil
              </Text>
              <TouchableOpacity
                onPress={() => setEditOpen(false)}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Campo nombre */}
            <Text
              style={[
                styles.modalLabel,
                { color: colors.textSecondary || "#6B7280" },
              ]}
            >
              Nombre
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Tu nombre"
              placeholderTextColor={colors.textSecondary || "#9CA3AF"}
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: isDarkMode ? "#334155" : "#E5E7EB",
                  backgroundColor: isDarkMode ? "#0B1220" : "#FFFFFF",
                },
              ]}
              returnKeyType="done"
              onSubmitEditing={onSaveProfile}
              accessibilityLabel="Campo de nombre"
            />

            {/* Previsualización foto si hay local */}
            {localPhoto && (
              <View style={styles.previewRow}>
                <Image source={{ uri: localPhoto }} style={styles.previewImg} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "800",
                      marginBottom: 6,
                    }}
                  >
                    Nueva foto seleccionada
                  </Text>

                  {uploading ? (
                    <View>
                      <View
                        style={[
                          styles.meterBg,
                          {
                            backgroundColor: isDarkMode
                              ? "#223043"
                              : "#E5E7EB",
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.meterFill,
                            {
                              width: `${uploadPct}%`,
                              backgroundColor:
                                uploadPct < 50 ? "#F59E0B" : "#22C55E",
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={{
                          marginTop: 6,
                          color: colors.textSecondary || "#94A3B8",
                          fontWeight: "700",
                        }}
                      >
                        Subiendo… {uploadPct}%
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={{
                        color: colors.textSecondary || "#94A3B8",
                      }}
                    >
                      Al guardar, subiremos tu nueva foto a la nube.
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Acciones */}
            <View style={styles.modalActions}>
              {uploading ? (
                <TouchableOpacity
                  onPress={cancelUpload}
                  style={[styles.cancelBtn, { borderColor: "#ef4444" }]}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Ionicons name="close" size={16} color="#ef4444" />
                  <Text
                    style={[styles.cancelTxt, { color: "#ef4444" }]}
                  >
                    Cancelar subida
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={pickNewPhoto}
                  style={[styles.pickBtn, { borderColor: colors.primary }]}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="image-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.pickTxt,
                      { color: colors.primary },
                    ]}
                  >
                    Elegir otra foto
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={onSaveProfile}
                activeOpacity={0.9}
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveTxt}>Guardar cambios</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ─────────────── estilos ─────────────── */
const AVATAR = 64;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 56,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 6 : 2,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  headerTitle: { fontSize: 20, fontWeight: "800" },

  card: {
    borderRadius: 16,
    padding: 14,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    marginBottom: 12,
  },

  userRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: AVATAR, height: AVATAR, borderRadius: 20 },
  avatarTxt: { fontSize: 20, fontWeight: "800" },
  name: { fontSize: 18, fontWeight: "800" },
  email: { fontSize: 13, marginTop: 2, fontWeight: "700" },

  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  editBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  removePhoto: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 8,
  },

  rowBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { fontSize: 14, fontWeight: "700" },

  switchPill: {
    width: 38,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    justifyContent: "center",
    paddingHorizontal: 2,
    overflow: "hidden",
  },
  switchDot: { width: 18, height: 18, borderRadius: 9 },

  logoutBtn: {
    marginTop: 6,
    borderWidth: 1.5,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  logoutTxt: { color: "#B91C1C", fontWeight: "800" },

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  modalCard: {
    width: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalLabel: { marginTop: 12, fontSize: 12, fontWeight: "700" },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },

  previewRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 12,
  },
  previewImg: { width: 72, height: 72, borderRadius: 16 },

  meterBg: { height: 8, borderRadius: 999, overflow: "hidden" },
  meterFill: { height: 8, borderRadius: 999 },

  modalActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  pickBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  pickTxt: { fontWeight: "800" },

  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  cancelTxt: { fontWeight: "800" },

  saveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveTxt: { color: "#fff", fontWeight: "800" },
});