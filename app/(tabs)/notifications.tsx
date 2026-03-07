// app/(tabs)/notifications.tsx
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    ListRenderItem,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useThemeContext } from "../../context/ThemeContext";

type NotificationType = "pedido" | "promo" | "sistema" | "alerta";

type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: "1",
    type: "pedido",
    title: "Tu pedido #ORD-98231 ha sido confirmado",
    message: "Estamos preparando tus artículos. Te avisaremos cuando salga a reparto.",
    time: "Hace 5 min",
    read: false,
  },
  {
    id: "2",
    type: "promo",
    title: "Hoy -20% en favoritos",
    message: "Solo por hoy tienes un 20% extra en tu lista de deseos.",
    time: "Hace 2 h",
    read: false,
  },
  {
    id: "3",
    type: "sistema",
    title: "Nueva versión disponible",
    message: "Actualiza ALAIA para disfrutar de mejoras de rendimiento.",
    time: "Ayer",
    read: true,
  },
  {
    id: "4",
    type: "alerta",
    title: "Problema con tu último pago",
    message: "No pudimos procesar tu tarjeta. Revisa tu método de pago.",
    time: "Hace 3 días",
    read: false,
  },
];

const typeMeta = (
  type: NotificationType
): { icon: keyof typeof Ionicons.glyphMap; color: string; label: string } => {
  switch (type) {
    case "pedido":
      return { icon: "cube-outline", color: "#3B82F6", label: "Pedido" };
    case "promo":
      return { icon: "pricetag-outline", color: "#F59E0B", label: "Promo" };
    case "sistema":
      return { icon: "settings-outline", color: "#10B981", label: "Sistema" };
    case "alerta":
      return { icon: "warning-outline", color: "#EF4444", label: "Alerta" };
    default:
      return { icon: "notifications-outline", color: "#6366F1", label: "Info" };
  }
};

export default function NotificationsTabScreen() {
  const { colors, isDarkMode } = useThemeContext();
  const [notifications, setNotifications] =
    useState<AppNotification[]>(MOCK_NOTIFICATIONS);

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
    Alert.alert("Limpiar bandeja", "¿Eliminar todas las notificaciones?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar todo",
        style: "destructive",
        onPress: () => setNotifications([]),
      },
    ]);
  };

  const renderItem: ListRenderItem<AppNotification> = ({ item }) => {
    const meta = typeMeta(item.type);

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDarkMode ? "#020617" : "#FFFFFF",
            borderColor: isDarkMode ? "#1F2937" : "#E5E7EB",
            opacity: item.read ? 0.6 : 1,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: meta.color + "20" },
              ]}
            >
              <Ionicons name={meta.icon} size={22} color={meta.color} />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={[styles.cardTitle, { color: colors.text }]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Text
                style={[
                  styles.cardMessage,
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
                <View
                  style={[
                    styles.typePill,
                    { borderColor: meta.color + "66" },
                  ]}
                >
                  <Text style={[styles.typePillText, { color: meta.color }]}>
                    {meta.label}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {!item.read && (
            <View
              style={[
                styles.unreadDot,
                { backgroundColor: meta.color },
              ]}
            />
          )}
        </View>

        <View style={styles.actionsRow}>
          {!item.read && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => markAsRead(item.id)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="done" size={18} color="#10B981" />
              <Text style={[styles.actionText, { color: "#10B981" }]}>
                Marcar como leída
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              Alert.alert(
                "Eliminar notificación",
                "¿Seguro que quieres eliminarla?",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Eliminar",
                    style: "destructive",
                    onPress: () => deleteNotification(item.id),
                  },
                ]
              )
            }
            activeOpacity={0.85}
          >
            <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
            <Text style={[styles.actionText, { color: "#EF4444" }]}>
              Eliminar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === "ios" ? 52 : 24,
        },
      ]}
    >
      {/* HEADER */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Notificaciones
          </Text>
          <Text
            style={[
              styles.headerSubtitle,
              { color: colors.textSecondary || "#9CA3AF" },
            ]}
          >
            {unreadCount > 0
              ? `${unreadCount} sin leer`
              : "Todo al día ✨"}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={markAllAsRead}
            disabled={!unreadCount}
            style={[
              styles.chip,
              {
                borderColor: colors.primary + "55",
                opacity: unreadCount ? 1 : 0.4,
              },
            ]}
            activeOpacity={0.85}
          >
            <Ionicons
              name="checkmark-done-outline"
              size={16}
              color={colors.primary}
            />
            <Text
              style={[
                styles.chipText,
                { color: colors.primary },
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

      {/* LISTA / VACÍO */}
      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="notifications-off-outline"
            size={64}
            color={isDarkMode ? "#475569" : "#CBD5E1"}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Sin notificaciones
          </Text>
          <Text
            style={[
              styles.emptyText,
              { color: isDarkMode ? "#94A3B8" : "#64748B" },
            ]}
          >
            Aquí aparecerán tus alertas de pedidos, promos y novedades.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

/* ----------------------------- estilos --------------------------- */

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  headerRow: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
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

  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  cardMessage: {
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
  typePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 6,
    marginTop: 6,
  },

  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
    gap: 14,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "700",
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
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