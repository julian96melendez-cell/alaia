// screens/CheckoutScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "firebase/firestore";
import { useCart } from "../context/CartContext";
import useTheme from "../hooks/useTheme";

const db = getFirestore();

type PaymentMethod = "card" | "cash" | "paypal";

type SavedAddress = {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  stateProv: string;
  zip: string;
};

export default function CheckoutScreen() {
  const { colors, isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, items, subtotal, discount, shipping, total, clearCart } =
    useCart();

  // ── Dirección de envío
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [zip, setZip] = useState("");
  const [saveAddress, setSaveAddress] = useState(true);

  // ── Pago
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Cargar dirección guardada
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("ALAIA_LAST_ADDRESS");
        if (saved) {
          const addr: SavedAddress = JSON.parse(saved);
          setFullName(addr.fullName || "");
          setPhone(addr.phone || "");
          setStreet(addr.street || "");
          setCity(addr.city || "");
          setStateProv(addr.stateProv || "");
          setZip(addr.zip || "");
        }
      } catch {
        // silencioso: no romper checkout
      }
    })();
  }, []);

  // ── Validaciones PRO

  const addressValid = useMemo(
    () =>
      !!(
        fullName.trim() &&
        phone.trim().length >= 6 &&
        street.trim() &&
        city.trim() &&
        stateProv.trim() &&
        zip.trim()
      ),
    [fullName, phone, street, city, stateProv, zip]
  );

  const cardValid = useMemo(() => {
    if (method !== "card") return true;

    const clean = cardNumber.replace(/\s+/g, "");
    const numOk = clean.length >= 12;

    const expOk = /^\d{2}\/\d{2}$/.test(cardExp);
    const cvvOk = /^\d{3,4}$/.test(cardCvv);

    return numOk && expOk && cvvOk;
  }, [method, cardNumber, cardExp, cardCvv]);

  const currentStep = useMemo(() => {
    if (!addressValid) return 1;
    if (method === "card" && !cardValid) return 2;
    return 3;
  }, [addressValid, method, cardValid]);

  const itemsCount = useMemo(
    () => items.reduce((acc, it) => acc + (it.quantity || 0), 0),
    [items]
  );

  // ── Errores por campo (para mostrar debajo del input)
  const fullNameError =
    submitted && !fullName.trim() ? "Este campo es obligatorio." : undefined;
  const phoneError =
    submitted && phone.trim().length < 6
      ? "Introduce un teléfono válido."
      : undefined;
  const streetError =
    submitted && !street.trim() ? "Este campo es obligatorio." : undefined;
  const cityError =
    submitted && !city.trim() ? "Este campo es obligatorio." : undefined;
  const stateError =
    submitted && !stateProv.trim() ? "Este campo es obligatorio." : undefined;
  const zipError =
    submitted && !zip.trim() ? "Este campo es obligatorio." : undefined;

  const cardNumberError =
    submitted && method === "card" && !cardValid
      ? "Revisa el número de tarjeta."
      : undefined;
  const cardExpError =
    submitted && method === "card" && !/^\d{2}\/\d{2}$/.test(cardExp)
      ? "Formato MM/AA."
      : undefined;
  const cardCvvError =
    submitted && method === "card" && !/^\d{3,4}$/.test(cardCvv)
      ? "CVV inválido."
      : undefined;

  // ── Confirmar pedido
  const placeOrder = async () => {
    setSubmitted(true);

    if (!user) {
      Alert.alert(
        "Inicia sesión",
        "Debes iniciar sesión para completar tu compra."
      );
      return;
    }
    if (!items.length) {
      Alert.alert("Carrito vacío", "Agrega productos antes de continuar.");
      return;
    }
    if (!addressValid) {
      Alert.alert("Datos incompletos", "Completa todos los campos de envío.");
      return;
    }
    if (!cardValid) {
      if (method === "card") {
        Alert.alert("Pago inválido", "Revisa los datos de tu tarjeta.");
      } else {
        Alert.alert("Pago inválido", "Revisa el método de pago seleccionado.");
      }
      return;
    }

    try {
      setLoading(true);

      // Guarda dirección local
      if (saveAddress) {
        const addr: SavedAddress = {
          fullName,
          phone,
          street,
          city,
          stateProv,
          zip,
        };
        await AsyncStorage.setItem(
          "ALAIA_LAST_ADDRESS",
          JSON.stringify(addr)
        );
      }

      // Documento a guardar (pedido)
      const order = {
        userId: user.uid,
        items: items.map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          image: it.image ?? null,
          color: it.color ?? null,
          size: it.size ?? null,
          category: it.category ?? null,
        })),
        pricing: { subtotal, discount, shipping, total },
        shippingAddress: {
          fullName,
          phone,
          street,
          city,
          state: stateProv,
          zip,
        },
        payment: {
          method,
          last4:
            method === "card"
              ? cardNumber.replace(/\s+/g, "").slice(-4)
              : null,
          provider:
            method === "paypal"
              ? "PayPal"
              : method === "cash"
              ? "COD"
              : "Card",
        },
        status: "placed" as const,
        createdAt: serverTimestamp(),
      };

      const res = await addDoc(
        collection(db, "users", user.uid, "orders"),
        order
      );
      await clearCart();

      setLoading(false);
      Alert.alert("¡Pedido confirmado!", `Tu número de pedido es: ${res.id}`, [
        {
          text: "Ver pedidos",
          onPress: () => navigation.navigate("Orders" as never),
        },
        {
          text: "Seguir comprando",
          onPress: () => navigation.navigate("Home" as never),
        },
      ]);
    } catch (e) {
      console.error("placeOrder error:", e);
      setLoading(false);
      Alert.alert(
        "Error",
        "No se pudo completar el pedido. Inténtalo nuevamente."
      );
    }
  };

  const confirmDisabled =
    loading ||
    !items.length ||
    !addressValid ||
    (method === "card" && !cardValid) ||
    !user;

  return (
    <KeyboardAvoidingView
      style={[styles.flex1, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Overlay de carga global */}
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View
            style={[
              styles.loadingCard,
              { backgroundColor: isDarkMode ? "#020617" : "#FFFFFF" },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.text }]}>
              Procesando tu pedido…
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Checkout
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Stepper de progreso */}
        <View style={styles.stepperWrap}>
          <View style={styles.stepperLineBg} />
          <View
            style={[
              styles.stepperLineActive,
              {
                backgroundColor: colors.primary,
                width: `${((currentStep - 1) / 2) * 100}%`,
              },
            ]}
          />
          {[
            { key: 1, label: "Dirección" },
            { key: 2, label: "Pago" },
            { key: 3, label: "Confirmar" },
          ].map((s) => {
            const active = currentStep >= s.key;
            return (
              <View key={s.key} style={styles.stepItem}>
                <View
                  style={[
                    styles.stepCircle,
                    {
                      borderColor: active
                        ? colors.primary
                        : isDarkMode
                        ? "#334155"
                        : "#CBD5E1",
                      backgroundColor: active
                        ? colors.primary
                        : colors.background,
                    },
                  ]}
                >
                  {active ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <Text
                      style={{
                        color: isDarkMode ? "#CBD5E1" : "#64748B",
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {s.key}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    {
                      color: active
                        ? colors.text
                        : isDarkMode
                        ? "#64748B"
                        : "#9CA3AF",
                    },
                  ]}
                >
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Aviso sesión */}
        {!user && (
          <View
            style={[
              styles.sessionAlert,
              {
                backgroundColor: isDarkMode ? "#1E293B" : "#EFF6FF",
                borderColor: colors.primary,
              },
            ]}
          >
            <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text
                style={[
                  styles.sessionTitle,
                  { color: colors.text },
                ]}
              >
                No has iniciado sesión
              </Text>
              <Text
                style={[
                  styles.sessionText,
                  { color: colors.textSecondary },
                ]}
              >
                Necesitas iniciar sesión para completar tu compra.
              </Text>
            </View>
          </View>
        )}

        {/* Resumen breve arriba */}
        <View style={[styles.summaryMini, { backgroundColor: colors.card }]}>
          <Ionicons name="bag-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryMiniTitle, { color: colors.text }]}>
              {itemsCount} producto{itemsCount === 1 ? "" : "s"} en tu compra
            </Text>
            <Text
              style={[
                styles.summaryMiniText,
                { color: colors.textSecondary },
              ]}
            >
              Total estimado: ${total.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Dirección */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Dirección de envío
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Input
            label="Nombre completo"
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              if (submitted) setSubmitted(false);
            }}
            error={fullNameError}
          />
          <Input
            label="Teléfono"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              if (submitted) setSubmitted(false);
            }}
            keyboardType="phone-pad"
            error={phoneError}
          />
          <Input
            label="Calle y número"
            value={street}
            onChangeText={(t) => {
              setStreet(t);
              if (submitted) setSubmitted(false);
            }}
            error={streetError}
          />
          <View style={styles.rowGap12}>
            <Input
              style={{ flex: 1 }}
              label="Ciudad"
              value={city}
              onChangeText={(t) => {
                setCity(t);
                if (submitted) setSubmitted(false);
              }}
              error={cityError}
            />
            <Input
              style={{ flex: 1 }}
              label="Estado/Provincia"
              value={stateProv}
              onChangeText={(t) => {
                setStateProv(t);
                if (submitted) setSubmitted(false);
              }}
              error={stateError}
            />
          </View>
          <Input
            label="Código Postal"
            value={zip}
            onChangeText={(t) => {
              setZip(t);
              if (submitted) setSubmitted(false);
            }}
            keyboardType="number-pad"
            error={zipError}
          />

          <TouchableOpacity
            onPress={() => setSaveAddress((v) => !v)}
            style={styles.checkboxRow}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: isDarkMode ? "#334155" : "#CBD5E1",
                  backgroundColor: saveAddress ? colors.primary : "transparent",
                },
              ]}
            >
              {saveAddress && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
            <Text
              style={[styles.checkboxLabel, { color: colors.text }]}
            >
              Guardar esta dirección para la próxima compra
            </Text>
          </TouchableOpacity>
        </View>

        {/* Método de pago */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Pago</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <PaymentOption
            label="Tarjeta de crédito/débito"
            value="card"
            selected={method}
            onSelect={(m) => {
              setMethod(m);
              if (submitted) setSubmitted(false);
            }}
            icon="card-outline"
          />
          {method === "card" && (
            <View style={{ marginTop: 8 }}>
              <Input
                label="Número de tarjeta"
                value={cardNumber}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^\d]/g, "");
                  const grouped = cleaned.replace(/(.{4})/g, "$1 ").trim();
                  setCardNumber(grouped);
                  if (submitted) setSubmitted(false);
                }}
                keyboardType="number-pad"
                placeholder="4242 4242 4242 4242"
                error={cardNumberError}
              />
              <View style={styles.rowGap12}>
                <Input
                  style={{ flex: 1 }}
                  label="Exp (MM/AA)"
                  value={cardExp}
                  onChangeText={(t) => {
                    setCardExp(t);
                    if (submitted) setSubmitted(false);
                  }}
                  keyboardType="number-pad"
                  placeholder="12/28"
                  error={cardExpError}
                />
                <Input
                  style={{ flex: 1 }}
                  label="CVV"
                  value={cardCvv}
                  onChangeText={(t) => {
                    setCardCvv(t);
                    if (submitted) setSubmitted(false);
                  }}
                  keyboardType="number-pad"
                  placeholder="123"
                  secureTextEntry
                  error={cardCvvError}
                />
              </View>
            </View>
          )}

          <PaymentOption
            label="PayPal"
            value="paypal"
            selected={method}
            onSelect={(m) => {
              setMethod(m);
              if (submitted) setSubmitted(false);
            }}
            icon="logo-paypal"
          />
          <PaymentOption
            label="Pago contra entrega"
            value="cash"
            selected={method}
            onSelect={(m) => {
              setMethod(m);
              if (submitted) setSubmitted(false);
            }}
            icon="cash-outline"
          />
        </View>

        {/* Resumen */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Resumen
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
          <Row
            label="Descuento"
            value={`-$${discount.toFixed(2)}`}
            accent={discount > 0 ? "green" : undefined}
          />
          <Row
            label="Envío"
            value={shipping === 0 ? "Gratis" : `$${shipping.toFixed(2)}`}
          />
          <View
            style={[
              styles.divider,
              { backgroundColor: isDarkMode ? "#334155" : "#E5E7EB" },
            ]}
          />
          <Row label="Total" value={`$${total.toFixed(2)}`} bold />
        </View>

        {/* Confirmar */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={placeOrder}
          disabled={confirmDisabled}
          style={[
            styles.payBtn,
            {
              backgroundColor: confirmDisabled
                ? "#9CA3AF"
                : colors.primary,
              opacity: confirmDisabled ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
          <Text style={styles.payText}>
            {loading ? "Procesando..." : "Confirmar compra"}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 16 }} />
        <Text
          style={{
            textAlign: "center",
            fontSize: 12,
            color: isDarkMode ? "#94A3B8" : "#64748B",
          }}
        >
          Al confirmar aceptas los términos y condiciones de ALAÏA.
        </Text>
        <View style={{ height: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ───────────────────────────── Subcomponentes ───────────────────────────── */

type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: any;
  secureTextEntry?: boolean;
  style?: any;
  error?: string;
};

function Input({ label, style, error, ...props }: InputProps) {
  const hasError = !!error;
  return (
    <View style={[{ marginBottom: 10 }, style]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#94A3B8"
        style={[
          styles.input,
          hasError && { borderColor: "#EF4444" },
        ]}
      />
      {hasError && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
}

type PaymentOptionProps = {
  label: string;
  value: PaymentMethod;
  selected: PaymentMethod;
  onSelect: (m: PaymentMethod) => void;
  icon: keyof typeof Ionicons.glyphMap;
};

function PaymentOption({
  label,
  value,
  selected,
  onSelect,
  icon,
}: PaymentOptionProps) {
  const active = selected === value;
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onSelect(value)}
      style={[
        styles.payOption,
        {
          borderColor: active ? "#6C63FF" : "#E5E7EB",
          backgroundColor: active ? "#6C63FF22" : "transparent",
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={active ? "#6C63FF" : "#64748B"}
      />
      <Text
        style={[
          styles.payOptionText,
          { color: active ? "#1F2937" : "#374151" },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.radio,
          { borderColor: active ? "#6C63FF" : "#CBD5E1" },
        ]}
      >
        {active && <View style={styles.radioDot} />}
      </View>
    </TouchableOpacity>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: "green" | "red";
}) {
  return (
    <View style={styles.rowBetween}>
      <Text
        style={[
          styles.rowLabel,
          bold && { fontWeight: "800", fontSize: 15 },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          bold && { fontWeight: "800", fontSize: 16 },
          accent === "green" && { color: "#10B981" },
          accent === "red" && { color: "#EF4444" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/* ───────────────────────────── Estilos ───────────────────────────── */
const styles = StyleSheet.create({
  flex1: { flex: 1 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    backgroundColor: "rgba(15,23,42,0.28)",
  },
  loadingCard: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    elevation: 5,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    alignItems: "center",
    minWidth: 220,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "600",
  },

  header: {
    height: 56,
    paddingHorizontal: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Platform.OS === "ios" ? 6 : 2,
  },
  headerTitle: { fontSize: 20, fontWeight: "800" },

  stepperWrap: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    paddingTop: 6,
  },
  stepperLineBg: {
    position: "absolute",
    top: 20,
    left: 30,
    right: 30,
    height: 2,
    backgroundColor: "#E5E7EB",
  },
  stepperLineActive: {
    position: "absolute",
    top: 20,
    left: 30,
    height: 2,
  },
  stepItem: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  sessionAlert: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  sessionTitle: { fontSize: 13, fontWeight: "800" },
  sessionText: { fontSize: 12, marginTop: 2 },

  summaryMini: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    elevation: 2,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  summaryMiniTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  summaryMiniText: {
    fontSize: 12,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
  },

  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.75,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputError: {
    marginTop: 3,
    fontSize: 11,
    color: "#EF4444",
    fontWeight: "600",
  },

  rowGap12: { flexDirection: "row", gap: 12 },

  checkboxRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  checkboxLabel: { fontSize: 13, fontWeight: "700" },

  payOption: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  payOptionText: { fontSize: 14, fontWeight: "700", flex: 1 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#6C63FF" },

  divider: { height: 1, marginVertical: 8, opacity: 0.7 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  rowLabel: { fontSize: 14, color: "#6B7280", fontWeight: "700" },
  rowValue: { fontSize: 14, color: "#111827", fontWeight: "700" },

  payBtn: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  payText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});