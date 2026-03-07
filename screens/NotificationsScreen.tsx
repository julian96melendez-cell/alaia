// screens/NotificationsScreen.tsx
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  ListRenderItem,
  Platform,
  Animated as RNAnimated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useThemeContext } from "../context/ThemeContext";

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
type NotificationType = "pedido" | "promoción" | "sistema" | "alerta" | "otro";

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

// ──────────────────────────────────────────────
// Mock data (simulado)
// ──────────────────────────────────────────────
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    type: "pedido",
    title: "Tu pedido ha sido enviado 🚚",
    message: "El pedido #ORD-98291 ya está en camino.",
    time: "Hace 2 horas",
    read: false,
  },
  {
    id: "2",
    type: "promoción",
    title: "Descuento especial 💥",
    message: "Obtén 20% de descuento en tu próxima compra.",
    time: "Hace 5 horas",
    read: false,
  },
  {
    id: "3",
    type: "sistema",
    title: "Actualización disponible ⚙️",
    message: "ShiboApp 1.1.0 ya está lista para descargar.",
    time: "Ayer",
    read: true,
  },
  {
    id: "4",
    type: "alerta",
    title: "Pago rechazado ❌",
    message: "Hubo un problema con tu método de pago.",
    time: "Hace 2 días",
    read: false,
  },
];

// ──────────────────────────────────────────────
// Utilidades de estilo según tipo
// ──────────────────────────────────────────────
const getTypeMeta = (
  type: NotificationType,
  fallbackPrimary: string
): { icon: keyof typeof Ionicons.glyphMap; color: string; label: string } => {
  switch (type) {
    case "pedido":
      return { icon: "cube-outline", color: "#3B82F6", label: "Pedidos" };
    case "promoción":
      return { icon: "pricetag-outline", color: "#F59E0B", label: "Promos" };
    case "sistema":
      return { icon: "settings-outline", color: "#10B981", label: "Sistema" };
    case "alerta":
      return { icon: "warning-outline", color: "#EF4444", label: "Alertas" };
    default:
      return { icon: "notifications-outline", color: fallbackPrimary, label: "Otros" };
  }
};

// ──────────────────────────────────────────────
// Row con swipe-to-delete (Reanimated + Gesture)
// ──────────────────────────────────────────────
type NotificationRowProps = {
  item: Notification;
  isDarkMode: boolean;
  primary: string;
  textColor: string;
  textSecondary: string;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
};

const SWIPE_THRESHOLD = 80;

const NotificationRow: React.FC<NotificationRowProps> = ({
  item,
  isDarkMode,
  primary,
  textColor,
  textSecondary,
  onMarkAsRead,
  onDelete,
}) => {
  const translateX = useSharedValue(0);
  const rowHeight = useSharedValue(1);
  const rowOpacity = useSharedValue(1);

  const meta = useMemo(() => getTypeMeta(item.type, primary), [item.type, primary]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((event) => {
          if (event.translationX < 0) {
            translateX.value = event.translationX;
          }
        })
        .onEnd(() => {
          if (Math.abs(translateX.value) > SWIPE_THRESHOLD) {
            translateX.value = withTiming(-300, { duration: 200 }, () => {
              rowHeight.value = withTiming(0, { duration: 150 });
              rowOpacity.value = withTiming(0, { duration: 150 }, () => {
                runOnJS(onDelete)(item.id);
              });
            });
          } else {
            translateX.value = withSpring(0, { damping: 18, stiffness: 120 });
          }
        }),
    [item.id, onDelete, rowHeight, rowOpacity, translateX]
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: rowOpacity.value,
    height: rowHeight.value === 0 ? 0 : undefined,
  }));

  const bg = isDarkMode ? "#0F172A" : "#FFFFFF";
  const border = isDarkMode ? "#1F2937" : "#E5E7EB";

  return (
    <View style={styles.swipeContainer}>
      {/* Botón de fondo (Eliminar) */}
      <View style={styles.swipeBackground}>
        <View style={styles.swipeDelete}>
          <MaterialIcons name="delete-outline" size={22} color="#FEE2E2" />
          <Text style={styles.swipeDeleteText}>Eliminar</Text>
        </View>
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.card,
            rowStyle,
            {
              backgroundColor: bg,
              borderColor: border,
              opacity: item.read ? 0.65 : 1,
            },
          ]}
        >
          <View style={styles.rowTop}>
            <View style={styles.rowLeft}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: meta.color + "20" },
                ]}
              >
                <Ionicons name={meta.icon} size={22} color={meta.color} />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.title, { color: textColor }]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.message,
                    { color: isDarkMode ? "#CBD5E1" : "#6B7280" },
                  ]}
                  numberOfLines={3}
                >
                  {item.message}
                </Text>

                <View style={styles.metaRow}>
                  <Text
                    style={[
                      styles.time,
                      { color: isDarkMode ? "#94A3B8" : "#9CA3AF" },
                    ]}
                  >
                    {item.time}
                  </Text>
                  <Text
                    style={[
                      styles.tag,
                      { color: textSecondary, borderColor: textSecondary + "66" },
                    ]}
                  >
                    {meta.label}
                  </Text>
                </View>
              </View>
            </View>

            {/* Indicador unread */}
            {!item.read && (
              <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />
            )}
          </View>

          {/* Acciones inline */}
          <View style={styles.actions}>
            {!item.read && (
              <TouchableOpacity
                style={styles.button}
                onPress={() => onMarkAsRead(item.id)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="done" size={18} color="#10B981" />
                <Text style={[styles.buttonText, { color: "#10B981" }]}>Marcar como leída</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.button}
              onPress={() =>
                Alert.alert(
                  "Eliminar notificación",
                  "¿Deseas eliminar esta notificación?",
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Eliminar",
                      style: "destructive",
                      onPress: () => onDelete(item.id),
                    },
                  ]
                )
              }
              activeOpacity={0.8}
            >
              <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
              <Text style={[styles.buttonText, { color: "#EF4444" }]}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

// ──────────────────────────────────────────────
// Pantalla principal
// ──────────────────────────────────────────────
export default function NotificationsScreen() {
  const { theme, isDarkMode } = useThemeContext();
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [fadeAnim] = useState(new RNAnimated.Value(0));

  useEffect(() => {
    RNAnimated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAllAsRead = () => {
    if (!unreadCount) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    if (!notifications.length) return;
    Alert.alert("Limpiar todo", "¿Eliminar todas las notificaciones?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar todo",
        style: "destructive",
        onPress: () => setNotifications([]),
      },
    ]);
  };

  const renderItem: ListRenderItem<Notification> = useCallback(
    ({ item }) => (
      <NotificationRow
        item={item}
        isDarkMode={isDarkMode}
        primary={theme.colors.primary}
        textColor={theme.colors.text}
        textSecondary={theme.colors.textSecondary || "#94A3B8"}
        onMarkAsRead={markAsRead}
        onDelete={deleteNotification}
      />
    ),
    [deleteNotification, isDarkMode, markAsRead, theme.colors.primary, theme.colors.text, theme.colors.textSecondary]
  );

  return (
    <RNAnimated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          opacity: fadeAnim,
          transform: [
            {
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Notificaciones
          </Text>
          <Text
            style={[
              styles.headerSubtitle,
              { color: theme.colors.textSecondary || "#9CA3AF" },
            ]}
          >
            {unreadCount > 0
              ? `${unreadCount} sin leer`
              : "Estás al día 🎉"}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={markAllAsRead}
            disabled={!unreadCount}
            style={[
              styles.chip,
              {
                borderColor: theme.colors.primary + "55",
                opacity: unreadCount ? 1 : 0.4,
              },
            ]}
            activeOpacity={0.85}
          >
            <Ionicons
              name="checkmark-done-outline"
              size={16}
              color={theme.colors.primary}
            />
            <Text
              style={[
                styles.chipText,
                { color: theme.colors.primary },
              ]}
            >
              Leer todo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={clearAll}
            disabled={!notifications.length}
            style={[
              styles.iconChip,
              {
                borderColor: isDarkMode ? "#334155" : "#E5E7EB",
                opacity: notifications.length ? 1 : 0.4,
              },
            ]}
            activeOpacity={0.85}
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color={isDarkMode ? "#E5E7EB" : "#4B5563"}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista / Empty state */}
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="notifications-off-outline"
            size={64}
            color={isDarkMode ? "#475569" : "#CBD5E1"}
          />
          <Text
            style={[
              styles.emptyTitle,
              { color: theme.colors.text },
            ]}
          >
            Sin notificaciones
          </Text>
          <Text
            style={[
              styles.emptyText,
              { color: isDarkMode ? "#94A3B8" : "#64748B" },
            ]}
          >
            Aquí verás alertas de pedidos, ofertas y novedades importantes.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </RNAnimated.View>
  );
}

// ──────────────────────────────────────────────
// Estilos
// ──────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 12 : 8,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    marginTop: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  swipeContainer: {
    marginBottom: 12,
  },
  swipeBackground: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 20,
  },
  swipeDelete: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#B91C1C",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  swipeDeleteText: {
    color: "#FEE2E2",
    fontSize: 13,
    fontWeight: "700",
  },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },

  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 15,
    fontWeight: "800",
  },
  message: {
    fontSize: 14,
    marginTop: 4,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 10,
  },
  time: {
    fontSize: 12,
    fontWeight: "600",
  },
  tag: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },

  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 8,
    marginTop: 6,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
    gap: 12,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: "700",
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },
});