// screens/OnboardingScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  ListRenderItem,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import useTheme from "../hooks/useTheme";

const { width } = Dimensions.get("window");

type RootStackNav = NavigationProp<Record<string, object | undefined>>;

type Slide = {
  id: string;
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

const SLIDES: Slide[] = [
  {
    id: "1",
    title: "Bienvenido a ALAIA",
    desc: "Explora una experiencia de compra moderna, rápida y diseñada para ti.",
    icon: "sparkles-outline",
    accent: "#6366F1",
  },
  {
    id: "2",
    title: "Productos inteligentes",
    desc: "Descubre colecciones seleccionadas, recomendaciones y ofertas en tiempo real.",
    icon: "bulb-outline",
    accent: "#F97316",
  },
  {
    id: "3",
    title: "Carrito sincronizado",
    desc: "Tu carrito se guarda en la nube, para que puedas continuar donde quieras.",
    icon: "cloud-outline",
    accent: "#10B981",
  },
];

export default function OnboardingScreen() {
  const navigation = useNavigation<RootStackNav>();
  const { colors, isDarkMode } = useTheme();

  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatRef = useRef<FlatList<Slide> | null>(null);

  const isLast = useMemo(() => index === SLIDES.length - 1, [index]);

  const handleFinish = useCallback(async () => {
    try {
      await AsyncStorage.setItem("HAS_SEEN_ONBOARDING", "1");
    } catch {
      // si falla el guardado, igualmente continuamos
    }
    navigation.reset({
      index: 0,
      routes: [{ name: "Auth" }],
    });
  }, [navigation]);

  const handleNext = useCallback(() => {
    if (isLast) {
      handleFinish();
      return;
    }
    const nextIndex = index + 1;
    flatRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    setIndex(nextIndex);
  }, [index, isLast, handleFinish]);

  const handleSkip = useCallback(() => {
    handleFinish();
  }, [handleFinish]);

  // ✅ Handler tipado correctamente para FlatList
  const onViewableItemsChanged = useRef<
    (info: { viewableItems: ViewToken[]; changed: ViewToken[] }) => void
  >(({ viewableItems }) => {
    if (viewableItems?.length && viewableItems[0].index != null) {
      setIndex(viewableItems[0].index);
    }
  }).current;

  const viewConfigRef = useRef({
    viewAreaCoveragePercentThreshold: 60,
  });

  const renderItem: ListRenderItem<Slide> = ({ item }) => {
    return (
      <View style={[styles.slide, { width }]}>
        <View style={styles.iconWrap}>
          <LinearGradient
            colors={
              isDarkMode
                ? ["#0F172A", "#020617"]
                : ["#EEF2FF", "#E0F2FE"]
            }
            style={styles.iconCircle}
          >
            <Ionicons name={item.icon} size={52} color={item.accent} />
          </LinearGradient>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          {item.title}
        </Text>

        <Text
          style={[
            styles.desc,
            { color: colors.textSecondary ?? "#64748B" },
          ]}
        >
          {item.desc}
        </Text>

        {/* Badges extra para look más pro */}
        <View style={styles.badgesRow}>
          <View style={[styles.badge, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              Seguro
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              Rápido
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="color-palette-outline" size={16} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              Moderno
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Dots animados
  const Dot = ({ i }: { i: number }) => {
    const inputRange = [(i - 1) * width, i * width, (i + 1) * width];

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [1, 1.4, 1],
      extrapolate: "clamp",
    });

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.4, 1, 0.4],
      extrapolate: "clamp",
    });

    return (
      <Animated.View
        style={[
          styles.dot,
          {
            transform: [{ scale }],
            opacity,
            backgroundColor: colors.primary,
          },
        ]}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      {/* Botón Saltar arriba derecha */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.8}>
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>
            Saltar
          </Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <Animated.FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfigRef.current}
      />

      {/* Indicadores + botones inferiores */}
      <View style={styles.bottom}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <Dot key={i} i={i} />
          ))}
        </View>

        {/* Botones */}
        <View style={styles.buttonsRow}>
          {!isLast && (
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                { borderColor: colors.primary },
              ]}
              activeOpacity={0.85}
              onPress={handleNext}
            >
              <Text style={[styles.secondaryText, { color: colors.primary }]}>
                Siguiente
              </Text>
            </TouchableOpacity>
          )}

          {isLast && (
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                { borderColor: colors.primary },
              ]}
              activeOpacity={0.85}
              onPress={handleFinish}
            >
              <Text style={[styles.secondaryText, { color: colors.primary }]}>
                Empezar
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.9}
            onPress={handleFinish}
          >
            <Text style={styles.primaryText}>
              {isLast ? "Ir a la app" : "Crear cuenta"}
            </Text>
            <Ionicons
              name={isLast ? "arrow-forward" : "log-in-outline"}
              size={18}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        <Text
          style={[
            styles.footerHint,
            { color: colors.textSecondary ?? "#94A3B8" },
          ]}
        >
          Puedes cambiar tus preferencias más adelante en Ajustes.
        </Text>
      </View>
    </View>
  );
}

/* ────────────────────────────────
 * Estilos
 * ───────────────────────────────*/
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    top: 50,
    right: 24,
    zIndex: 10,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  slide: {
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    marginBottom: 26,
    marginTop: 40,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  desc: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  badgesRow: {
    flexDirection: "row",
    marginTop: 22,
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 26,
    paddingTop: 8,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  buttonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  secondaryBtn: {
    flex: 0.9,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryBtn: {
    flex: 1.3,
    borderRadius: 999,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  footerHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
});