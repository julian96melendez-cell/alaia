// screens/HelpScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import useTheme from "../hooks/useTheme";

// Habilitar animaciones suaves en Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

type QuickAction = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

const FAQ_ITEMS: FAQItem[] = [
  {
    id: "faq-1",
    question: "¿Cómo puedo restablecer mi contraseña?",
    answer:
      "Ve a la sección de configuración, selecciona \"Seguridad\" y luego \"Cambiar contraseña\". También puedes usar la opción \"Olvidé mi contraseña\" desde la pantalla de acceso.",
    category: "Cuenta",
  },
  {
    id: "faq-2",
    question: "¿Dónde puedo ver mis pedidos?",
    answer:
      "Dirígete a tu perfil y selecciona \"Mis compras\" o \"Pedidos\". Allí verás el historial detallado de tus órdenes y su estado actual.",
    category: "Compras",
  },
  {
    id: "faq-3",
    question: "¿Cómo activo las notificaciones?",
    answer:
      "En la pantalla de configuración, entra a \"Notificaciones\" y activa las categorías que te interesen (pedidos, promociones, seguridad, etc.).",
    category: "Notificaciones",
  },
  {
    id: "faq-4",
    question: "¿Cómo contacto al soporte?",
    answer:
      "Puedes escribirnos directamente desde esta pantalla usando el botón \"Enviar correo\" o a través de nuestro correo oficial de soporte.",
    category: "Soporte",
  },
];

export default function HelpScreen() {
  const { theme } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const sub = theme.textSecondary ?? "#999";

  const intro = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [intro]);

  const handleToggleFAQ = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleContact = () => {
    const email = "soporte@tutienda.com";
    const subject = encodeURIComponent("Asistencia técnica - Tu App");
    const body = encodeURIComponent("Hola, necesito ayuda con...");
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`).catch(() =>
      Alert.alert("Error", "No se pudo abrir la aplicación de correo.")
    );
  };

  const handleSendFeedback = () => {
    if (!feedback.trim()) {
      Alert.alert("💬 Feedback", "Por favor, escribe tu comentario.");
      return;
    }
    Alert.alert("✅ Enviado", "Gracias por tu opinión. ¡Nos ayudas a mejorar!");
    setFeedback("");
  };

  const handleReportBug = () => {
    Alert.alert(
      "🐞 Reportar error",
      "Describe brevemente el problema. Tu reporte ayudará a nuestro equipo técnico a corregirlo más rápido."
    );
  };

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        id: "qa-1",
        label: "Contactar soporte",
        icon: "chatbubbles-outline",
        onPress: handleContact,
      },
      {
        id: "qa-2",
        label: "Reportar error",
        icon: "bug-outline",
        onPress: handleReportBug,
      },
      {
        id: "qa-3",
        label: "Ver preguntas frecuentes",
        icon: "help-circle-outline",
        onPress: () => {
          Alert.alert("FAQ", "Desplázate hacia arriba para ver las preguntas frecuentes destacadas.");
        },
      },
    ],
    []
  );

  return (
    <Animated.View
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
          opacity: intro,
          transform: [
            {
              translateY: intro.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="help-buoy-outline" size={22} color={theme.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Centro de ayuda</Text>
            <Text style={[styles.headerSubtitle, { color: sub }]}>
              Encuentra respuestas rápidas o contacta a nuestro equipo.
            </Text>
          </View>
        </View>

        {/* Acciones rápidas */}
        <View style={styles.section}>
          <SectionHeader
            icon="flash-outline"
            label="Acciones rápidas"
            color={theme.tint}
            textColor={theme.text}
          />
          <View style={styles.quickRow}>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.quickCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                activeOpacity={0.9}
                onPress={action.onPress}
              >
                <Ionicons name={action.icon} size={20} color={theme.tint} />
                <Text style={[styles.quickLabel, { color: theme.text }]} numberOfLines={2}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* FAQ */}
        <View style={styles.section}>
          <SectionHeader
            icon="help-circle-outline"
            label="Preguntas frecuentes"
            color={theme.tint}
            textColor={theme.text}
          />

          {FAQ_ITEMS.map((faq) => (
            <FAQRow
              key={faq.id}
              item={faq}
              expanded={expandedId === faq.id}
              onToggle={() => handleToggleFAQ(faq.id)}
              theme={{
                text: theme.text,
                subtext: sub,
                border: theme.border,
              }}
            />
          ))}
        </View>

        {/* Contacto directo */}
        <View style={styles.section}>
          <SectionHeader
            icon="mail-outline"
            label="Contactar soporte"
            color={theme.tint}
            textColor={theme.text}
          />

          <Text style={[styles.bodyText, { color: sub }]}>
            Si necesitas ayuda personalizada, puedes escribirnos y te responderemos lo antes posible.
          </Text>

          <TouchableOpacity
            style={[styles.buttonPrimary, { backgroundColor: theme.tint }]}
            onPress={handleContact}
            activeOpacity={0.9}
          >
            <Ionicons name="mail-outline" size={20} color="#fff" />
            <Text style={styles.buttonPrimaryText}>Enviar correo a soporte</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonGhost, { borderColor: theme.tint }]}
            onPress={handleReportBug}
            activeOpacity={0.9}
          >
            <Ionicons name="bug-outline" size={18} color={theme.tint} />
            <Text style={[styles.buttonGhostText, { color: theme.tint }]}>Reportar un error</Text>
          </TouchableOpacity>
        </View>

        {/* Feedback */}
        <View style={styles.section}>
          <SectionHeader
            icon="chatbox-ellipses-outline"
            label="Enviar comentarios"
            color={theme.tint}
            textColor={theme.text}
          />

          <Text style={[styles.bodyText, { color: sub }]}>
            Cuéntanos qué te gustaría mejorar o qué te ha gustado de la app. Leemos todos los mensajes.
          </Text>

          <TextInput
            value={feedback}
            onChangeText={setFeedback}
            placeholder="Escribe tus sugerencias, comentarios o ideas..."
            placeholderTextColor={sub}
            multiline
            style={[
              styles.input,
              {
                borderColor: theme.border,
                color: theme.text,
                backgroundColor: theme.card,
              },
            ]}
          />

          <TouchableOpacity
            style={[styles.buttonPrimary, { backgroundColor: theme.tint }]}
            onPress={handleSendFeedback}
            activeOpacity={0.9}
          >
            <Ionicons name="send-outline" size={20} color="#fff" />
            <Text style={styles.buttonPrimaryText}>Enviar comentario</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={[styles.footerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="shield-checkmark-outline" size={22} color={theme.tint} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.footerTitle, { color: theme.text }]}>Siempre a tu lado</Text>
            <Text style={[styles.footerText, { color: sub }]}>
              Nuestro equipo de soporte está disponible para ayudarte con pagos, pedidos y cualquier duda
              relacionada con tu cuenta.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

function SectionHeader({
  icon,
  label,
  color,
  textColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  textColor: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconWrap, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.sectionTitle, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function FAQRow({
  item,
  expanded,
  onToggle,
  theme,
}: {
  item: FAQItem;
  expanded: boolean;
  onToggle: () => void;
  theme: { text: string; subtext: string; border: string };
}) {
  return (
    <View style={[styles.faqItem, { borderColor: theme.border }]}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.faqHeader}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={item.question}
        accessibilityState={{ expanded }}
      >
        <View style={{ flex: 1 }}>
          {!!item.category && (
            <Text style={[styles.faqCategory, { color: theme.subtext }]}>{item.category}</Text>
          )}
          <Text style={[styles.faqQuestion, { color: theme.text }]}>{item.question}</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.subtext}
        />
      </TouchableOpacity>

      {expanded && (
        <Text style={[styles.faqAnswer, { color: theme.subtext }]}>{item.answer}</Text>
      )}
    </View>
  );
}

/* ───────────────────────────── Estilos ───────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingTop: 52, paddingBottom: 32, paddingHorizontal: 20 },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.16)",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", letterSpacing: 0.2 },
  headerSubtitle: { marginTop: 2, fontSize: 13, fontWeight: "600" },

  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800" },

  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginTop: 2,
  },
  quickCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 4,
    marginTop: 8,
    gap: 8,
    flexShrink: 1,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },

  faqItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  faqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faqCategory: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  faqQuestion: { fontSize: 15, fontWeight: "700", flex: 1 },
  faqAnswer: { marginTop: 6, fontSize: 14, lineHeight: 20 },

  bodyText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
    fontWeight: "500",
  },

  buttonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
    gap: 6,
  },
  buttonPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  buttonGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.4,
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: 10,
    gap: 6,
  },
  buttonGhostText: { fontSize: 14, fontWeight: "700" },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: "top",
    marginTop: 6,
    marginBottom: 12,
  },

  footerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  footerTitle: { fontSize: 14, fontWeight: "800", marginBottom: 2 },
  footerText: { fontSize: 13, lineHeight: 19 },
});