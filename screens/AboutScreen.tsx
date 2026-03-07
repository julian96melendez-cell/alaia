// screens/AboutScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import {
  Alert,
  Animated,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import useTheme from "../hooks/useTheme";

type Themed = ReturnType<typeof useTheme>["theme"];

export default function AboutScreen() {
  const { theme, isDarkMode } = useTheme();

  const appName = "Mi Tienda App";
  const version = "2.0.1";
  const year = "2025";

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(18)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(heroTranslateY, {
        toValue: 0,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroOpacity, heroTranslateY, logoScale]);

  const handleLinkPress = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "No se pudo abrir el enlace.")
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero superior */}
      <Animated.View
        style={{
          opacity: heroOpacity,
          transform: [{ translateY: heroTranslateY }],
        }}
      >
        <LinearGradient
          colors={[theme.tint, isDarkMode ? "#020617" : "#EEF2FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroLeft}>
            <View style={styles.heroTagsRow}>
              <Tag theme={theme} icon="sparkles-outline" label="E-commerce moderno" />
              <Tag theme={theme} icon="shield-checkmark-outline" label={`v${version}`} subtle />
            </View>

            <Text style={[styles.appName, { color: theme.text }]}>{appName}</Text>
            <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
              Compras rápidas, seguras y diseñadas con una experiencia premium para tus usuarios.
            </Text>
          </View>

          <Animated.View style={{ transform: [{ scale: logoScale }] }}>
            <View style={[styles.logoWrap, { borderColor: `${theme.tint}55` }]}>
              <Image source={require("../assets/images/logo.png")} style={styles.logo} />
            </View>
          </Animated.View>
        </LinearGradient>
      </Animated.View>

      {/* Cards principales */}
      <View style={styles.sectionWrapper}>
        {/* Acerca de la app */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: isDarkMode ? "#1F2937" : "#E5E7EB" },
          ]}
        >
          <SectionHeader theme={theme} title="Acerca de la aplicación" icon="information-circle-outline" />
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            <Text style={{ fontWeight: "700", color: theme.text }}>Mi Tienda App</Text> es una plataforma
            de compras en línea creada para ofrecer una experiencia rápida, intuitiva y optimizada.
          </Text>

          <View style={styles.bulletRow}>
            <Bullet theme={theme} text="Catálogo dinámico con filtrado rápido y búsqueda avanzada." />
            <Bullet theme={theme} text="Carrito inteligente con cupones y resumen en tiempo real." />
            <Bullet theme={theme} text="Soporte para tema claro/oscuro y personalización." />
          </View>
        </View>

        {/* Highlights */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: isDarkMode ? "#1F2937" : "#E5E7EB" },
          ]}
        >
          <SectionHeader theme={theme} icon="stats-chart-outline" title="Highlights del proyecto" />

          <View style={styles.statsRow}>
            <StatCard theme={theme} label="Rendimiento" value="Ultra fluido" icon="speedometer-outline" />
            <StatCard theme={theme} label="Arquitectura" value="Modular" icon="layers-outline" />
            <StatCard theme={theme} label="Seguridad" value="Firebase Auth" icon="lock-closed-outline" />
          </View>

          <View style={styles.techRow}>
            <TechChip theme={theme} label="React Native" />
            <TechChip theme={theme} label="TypeScript" />
            <TechChip theme={theme} label="Expo" />
            <TechChip theme={theme} label="Firebase" />
          </View>
        </View>

        {/* Desarrollador */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: isDarkMode ? "#1F2937" : "#E5E7EB" },
          ]}
        >
          <SectionHeader theme={theme} icon="person-outline" title="Desarrollado por" />

          <View style={styles.devRow}>
            <View style={styles.devAvatarWrap}>
              <Ionicons name="person-circle-outline" size={48} color={theme.tint} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.devName, { color: theme.text }]}>Hacere López</Text>
              <Text style={[styles.devRole, { color: theme.textSecondary }]}>
                Arquitectura, UI/UX, Firebase y optimización.
              </Text>
              <View style={styles.devTagsRow}>
                <Tag theme={theme} label="Full-stack" icon="code-slash-outline" subtle />
                <Tag theme={theme} label="Mobile-first" icon="phone-portrait-outline" subtle />
              </View>
            </View>
          </View>
        </View>

        {/* Enlaces útiles */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: isDarkMode ? "#1F2937" : "#E5E7EB" },
          ]}
        >
          <SectionHeader theme={theme} title="Enlaces útiles" icon="link-outline" />

          <LinkItem
            icon="logo-github"
            label="Repositorio en GitHub"
            subtitle="Código fuente y buenas prácticas."
            url="https://github.com/"
            theme={theme}
          />

          <LinkItem
            icon="logo-instagram"
            label="Instagram del desarrollador"
            subtitle="Novedades y proyectos."
            url="https://instagram.com/"
            theme={theme}
          />

          <LinkItem
            icon="document-text-outline"
            label="Política de privacidad"
            subtitle="Tratamiento de datos."
            url="https://example.com/privacy"
            theme={theme}
          />
        </View>

        {/* Licencia */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: isDarkMode ? "#1F2937" : "#E5E7EB" },
          ]}
        >
          <SectionHeader theme={theme} title="Licencia" icon="book-outline" />
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            © {year} {appName}. Licencia MIT.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Ionicons name="heart-outline" size={16} color={theme.textSecondary} style={{ marginRight: 4 }} />
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Construido con dedicación para ofrecer una experiencia profesional.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* SUBCOMPONENTES */

function SectionHeader({ theme, title, icon }: { theme: Themed; title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionTitleLeft}>
        <View style={[styles.sectionIconWrap, { backgroundColor: `${theme.tint}18` }]}>
          <Ionicons name={icon} size={18} color={theme.tint} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      </View>
    </View>
  );
}

function Tag({ theme, icon, label, subtle }: any) {
  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: subtle ? `${theme.card}AA` : `${theme.tint}22`,
          borderColor: subtle ? `${theme.border}` : `${theme.tint}55`,
        },
      ]}
    >
      <Ionicons name={icon} size={12} color={subtle ? theme.textSecondary : theme.tint} />
      <Text style={[styles.tagText, { color: subtle ? theme.textSecondary : theme.tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Bullet({ theme, text }: any) {
  return (
    <View style={styles.bulletItem}>
      <Ionicons name="checkmark-circle-outline" size={16} color={theme.tint} />
      <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );
}

function StatCard({ theme, label, value, icon }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: theme.background, borderColor: `${theme.border}AA` }]}>
      <Ionicons name={icon} size={18} color={theme.tint} />
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function TechChip({ theme, label }: any) {
  return (
    <View style={[styles.techChip, { borderColor: `${theme.border}AA`, backgroundColor: theme.background }]}>
      <Ionicons name="radio-button-on-outline" size={10} color={theme.tint} />
      <Text style={[styles.techText, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

function LinkItem({ icon, label, subtitle, url, theme }: any) {
  return (
    <TouchableOpacity
      style={[styles.linkItem, { borderColor: `${theme.border}AA` }]}
      onPress={() => Linking.openURL(url)}
      activeOpacity={0.75}
    >
      <View style={styles.linkIconWrap}>
        <Ionicons name={icon} size={20} color={theme.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.linkLabel, { color: theme.text }]}>{label}</Text>
        {!!subtitle && <Text style={[styles.linkSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </TouchableOpacity>
  );
}

/* ESTILOS */
const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionWrapper: { paddingHorizontal: 20, marginTop: 10 },

  hero: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  heroLeft: { flex: 1, paddingRight: 10 },
  heroTagsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  appName: { fontSize: 24, fontWeight: "900", letterSpacing: 0.3 },
  heroSubtitle: { marginTop: 6, fontSize: 13, lineHeight: 20, fontWeight: "600" },

  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  logo: { width: 64, height: 64, resizeMode: "contain" },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginTop: 18,
    elevation: 3,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  sectionHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionTitleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionIconWrap: { width: 26, height: 26, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "800" },

  paragraph: { fontSize: 13, lineHeight: 20, marginTop: 2 },

  bulletRow: { marginTop: 10, gap: 6 },
  bulletItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  bulletText: { fontSize: 13, flex: 1, lineHeight: 19 },

  tag: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  tagText: { fontSize: 11, fontWeight: "700", marginLeft: 4 },

  statsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "flex-start",
    gap: 4,
  },
  statLabel: { fontSize: 11, fontWeight: "600" },
  statValue: { fontSize: 13, fontWeight: "800" },

  techRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  techChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  techText: { fontSize: 11, fontWeight: "700" },

  devRow: { flexDirection: "row", gap: 12, marginTop: 6 },
  devAvatarWrap: { justifyContent: "center", alignItems: "center" },
  devName: { fontSize: 15, fontWeight: "800" },
  devRole: { fontSize: 13, marginTop: 2, lineHeight: 20 },
  devTagsRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },

  linkItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  linkIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
  linkLabel: { fontSize: 14, fontWeight: "700" },
  linkSubtitle: { fontSize: 12, marginTop: 2 },

  footer: { marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  footerText: { fontSize: 12, textAlign: "center" },
});