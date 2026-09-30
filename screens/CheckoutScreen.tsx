import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStripe } from "@stripe/stripe-react-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import Colors from "../constants/Colors";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { API_BASE_URL } from "../config/api";

const TAX_PERCENT = 0.07;
const RETURN_URL = "alaiaclean://stripe-redirect";
const ADDRESS_KEY = "ALAIA_LAST_CHECKOUT_ADDRESS";

type SavedAddress = {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  stateProv: string;
  zip: string;
};

type PaymentSheetResponse = {
  clientSecret: string;
  paymentIntentId: string;
  customerId?: string;
  ephemeralKeySecret?: string;
  mongoOrdenId: string;
  ordenId: string;
  orderId: string;
  clientOrderRef: string;
  firestoreOrderId: string;
  pricing: { subtotal: number; tax: number; shipping: number; discount: number; total: number };
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function isMongoObjectId(value: unknown) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value.trim());
}

function cleanNumber(value: unknown) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { user } = useAuth();
  const { items, subtotal, shipping, discount, total, coupon, clearCart } = useCart();
  const [serverPricing, setServerPricing] = useState<PaymentSheetResponse["pricing"] | null>(null);

  const [processing, setProcessing] = useState(false);
  const paymentInProgress = useRef(false);
  const [submitted, setSubmitted] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [zip, setZip] = useState("");
  const [saveAddress, setSaveAddress] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ADDRESS_KEY)
      .then((raw) => {
        if (!raw) return;

        const saved = JSON.parse(raw) as SavedAddress;

        setFullName(saved.fullName || "");
        setPhone(saved.phone || "");
        setStreet(saved.street || "");
        setCity(saved.city || "");
        setStateProv(saved.stateProv || "");
        setZip(saved.zip || "");
      })
      .catch(() => {});
  }, []);

  const tax = useMemo(
    () => cleanNumber(cleanNumber(subtotal) * TAX_PERCENT),
    [subtotal]
  );

  const finalTotal = useMemo(
    () => cleanNumber(cleanNumber(total) + tax),
    [total, tax]
  );

  useEffect(() => { setServerPricing(null); }, [items, coupon?.code]);

  const itemsCount = useMemo(
    () => items.reduce((acc, item) => acc + Number(item.quantity || 0), 0),
    [items]
  );

  const invalidCartItem = useMemo(
    () => items.find((item) => !isMongoObjectId(item.id)),
    [items]
  );

  const addressValid = useMemo(
    () =>
      Boolean(
        fullName.trim() &&
          phone.trim().length >= 6 &&
          street.trim() &&
          city.trim() &&
          stateProv.trim() &&
          zip.trim()
      ),
    [fullName, phone, street, city, stateProv, zip]
  );

  const canPay =
    !!user?.uid &&
    items.length > 0 &&
    addressValid &&
    !invalidCartItem &&
    !processing;

  const validateBeforePay = () => {
    if (!user?.uid) {
      Alert.alert("Sesión requerida", "Debes iniciar sesión para continuar.");
      router.replace("/(auth)/login" as any);
      return false;
    }

    if (!items.length) {
      Alert.alert("Carrito vacío", "Añade productos antes de pagar.");
      return false;
    }

    if (invalidCartItem) {
      Alert.alert(
        "Producto no sincronizado",
        `El producto "${invalidCartItem.name}" no tiene un ObjectId válido de Mongo. Vacía el carrito y agrégalo otra vez desde productos sincronizados.`
      );
      return false;
    }

    if (!addressValid) {
      Alert.alert("Datos incompletos", "Completa tu dirección de entrega.");
      return false;
    }

    if (finalTotal <= 0) {
      Alert.alert("Total inválido", "El total de la orden no es válido.");
      return false;
    }

    return true;
  };

  const requestPaymentIntent = async (): Promise<PaymentSheetResponse> => {
    if (!user) throw new Error("Debes iniciar sesión para continuar.");
    const token = await user.getIdToken();
    const response = await fetch(`${API_BASE_URL}/api/stripe/payment-sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: items.map((item) => ({ producto: item.id, cantidad: Number(item.quantity) })),
        couponCode: coupon?.code || "",
        shippingAddress: { fullName, phone, street, city, state: stateProv, zip },
      }),
    });

    const text = await response.text();

    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Respuesta inválida del backend.");
    }

    if (!response.ok || !json?.clientSecret || !json?.paymentIntentId) {
      throw new Error(
        json?.message || `No se pudo iniciar Stripe. Status: ${response.status}`
      );
    }

    if (!json.pricing || !["subtotal", "tax", "shipping", "discount", "total"].every((key) =>
      typeof json.pricing[key] === "number" && Number.isFinite(json.pricing[key]) && json.pricing[key] >= 0
    )) throw new Error("El backend debe devolver el resumen autoritativo de la orden.");
    return {
      pricing: json.pricing,
      clientSecret: String(json.clientSecret),
      paymentIntentId: String(json.paymentIntentId),
      customerId: json.customerId ? String(json.customerId) : "",
      ephemeralKeySecret: json.ephemeralKeySecret
        ? String(json.ephemeralKeySecret)
        : "",
      mongoOrdenId: String(json.mongoOrdenId || json.ordenId || json.orderId || ""),
      ordenId: String(json.ordenId || json.mongoOrdenId || json.orderId || ""),
      orderId: String(json.orderId || json.mongoOrdenId || json.ordenId || ""),
      clientOrderRef: String(json.clientOrderRef || json.firestoreOrderId || ""),
      firestoreOrderId: String(json.firestoreOrderId || json.clientOrderRef || ""),
    };
  };

  const saveAddressIfNeeded = async () => {
    if (!saveAddress) return;

    const address: SavedAddress = {
      fullName,
      phone,
      street,
      city,
      stateProv,
      zip,
    };

    await AsyncStorage.setItem(ADDRESS_KEY, JSON.stringify(address));
  };

  const handlePay = async () => {
    setSubmitted(true);

    if (paymentInProgress.current) return;
    if (!validateBeforePay()) return;

    paymentInProgress.current = true;
    try {
      setProcessing(true);

      await saveAddressIfNeeded();

      const paymentData = await requestPaymentIntent();
      setServerPricing(paymentData.pricing);
      if (Math.abs(paymentData.pricing.total - finalTotal) > 0.01) {
        const accepted = await new Promise<boolean>((resolve) => {
          Alert.alert("Total actualizado", `El total calculado por la tienda es ${formatMoney(paymentData.pricing.total)}.`, [
            { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
            { text: "Continuar", onPress: () => resolve(true) },
          ], { cancelable: false });
        });
        if (!accepted) return;
      }

      const initParams: any = {
        merchantDisplayName: "ALAIA",
        paymentIntentClientSecret: paymentData.clientSecret,
        returnURL: RETURN_URL,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: {
          email: user?.email || undefined,
          name: fullName || undefined,
          phone: phone || undefined,
        },
      };

      if (paymentData.customerId && paymentData.ephemeralKeySecret) {
        initParams.customerId = paymentData.customerId;
        initParams.customerEphemeralKeySecret = paymentData.ephemeralKeySecret;
      }

      const initResult = await initPaymentSheet(initParams);
      if (initResult.error) throw new Error(initResult.error.message);
      const paymentResult = await presentPaymentSheet();
      if (paymentResult.error) {
        if (paymentResult.error.code === "Canceled") {
          Alert.alert("Pago cancelado", "La orden quedó pendiente. Puedes intentarlo nuevamente.");
          return;
        }
        throw new Error(paymentResult.error.message);
      }
      try { await clearCart(); } catch {
        Alert.alert("Carrito pendiente", "No se pudo vaciar el carrito. Consulta el estado de tu orden antes de volver a pagar.");
      }
      const trackingId = paymentData.mongoOrdenId || paymentData.ordenId;
      Alert.alert("Pago enviado", "Estamos verificando el pago con Stripe. Consulta el estado de tu orden.", [
        { text: "Ver seguimiento", onPress: () => router.replace(`/track/${trackingId}` as any) },
        { text: "Ver órdenes", onPress: () => router.replace("/(tabs)/orders" as any) },
      ]);
    } catch (err: any) {
      console.warn("No se pudo completar el flujo de checkout");
      Alert.alert("No se pudo completar el pago", err?.message || "Intenta nuevamente.");
    } finally {
      paymentInProgress.current = false;
      setProcessing(false);
    }
  };

  if (!items.length) {
    return (
      <View style={styles.center}>
        <Ionicons name="cart-outline" size={54} color="#94A3B8" />
        <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
        <Text style={styles.emptyText}>
          Añade productos antes de continuar al checkout.
        </Text>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.replace("/(tabs)/cart" as any)}
        >
          <Text style={styles.secondaryText}>Volver al carrito</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Checkout</Text>
        <Text style={styles.subtitle}>
          Completa tu dirección, revisa el resumen y paga de forma segura con
          Stripe.
        </Text>

        {!user?.uid && (
          <View style={styles.warningCard}>
            <Ionicons name="person-circle-outline" size={22} color="#2563EB" />
            <Text style={styles.warningText}>
              Necesitas iniciar sesión para completar la compra.
            </Text>
          </View>
        )}

        {invalidCartItem && (
          <View style={styles.errorCard}>
            <Ionicons name="warning-outline" size={22} color="#DC2626" />
            <Text style={styles.errorText}>
              {`El producto "${invalidCartItem.name}" no tiene ObjectId válido de Mongo.`}
            </Text>
          </View>
        )}

        <View style={styles.progressCard}>
          <Step active label="Carrito" icon="cart-outline" />
          <View style={styles.progressLine} />
          <Step active={addressValid} label="Dirección" icon="location-outline" />
          <View style={styles.progressLine} />
          <Step active={canPay} label="Pago" icon="card-outline" />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dirección de entrega</Text>

          <Input
            label="Nombre completo"
            value={fullName}
            onChangeText={setFullName}
            error={submitted && !fullName.trim() ? "Campo obligatorio." : ""}
          />

          <Input
            label="Teléfono"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            error={
              submitted && phone.trim().length < 6
                ? "Introduce un teléfono válido."
                : ""
            }
          />

          <Input
            label="Calle y número"
            value={street}
            onChangeText={setStreet}
            error={submitted && !street.trim() ? "Campo obligatorio." : ""}
          />

          <View style={styles.row}>
            <Input
              containerStyle={{ flex: 1 }}
              label="Ciudad"
              value={city}
              onChangeText={setCity}
              error={submitted && !city.trim() ? "Obligatorio." : ""}
            />

            <Input
              containerStyle={{ flex: 1 }}
              label="Estado/Provincia"
              value={stateProv}
              onChangeText={setStateProv}
              error={submitted && !stateProv.trim() ? "Obligatorio." : ""}
            />
          </View>

          <Input
            label="Código postal"
            value={zip}
            onChangeText={setZip}
            keyboardType="number-pad"
            error={submitted && !zip.trim() ? "Campo obligatorio." : ""}
          />

          <Pressable
            style={styles.checkboxRow}
            onPress={() => setSaveAddress((v) => !v)}
          >
            <View style={[styles.checkbox, saveAddress && styles.checkboxOn]}>
              {saveAddress && (
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              )}
            </View>
            <Text style={styles.checkboxText}>
              Guardar esta dirección para próximas compras.
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Productos</Text>

          {items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemIcon}>
                <Ionicons
                  name="cube-outline"
                  size={20}
                  color={Colors.light.primary}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.itemMeta}>
                  Cantidad: {item.quantity}
                  {item.category ? ` · ${item.category}` : ""}
                </Text>
              </View>

              <Text style={styles.itemPrice}>
                {formatMoney(Number(item.price || 0) * Number(item.quantity || 1))}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Resumen</Text>

          <SummaryRow label="Productos" value={`${itemsCount}`} />
          <SummaryRow label="Subtotal" value={formatMoney(serverPricing?.subtotal ?? subtotal)} />
          <SummaryRow label="Impuestos" value={formatMoney(serverPricing?.tax ?? tax)} />
          <SummaryRow label="Descuento" value={`-${formatMoney(serverPricing?.discount ?? discount)}`} />
          <SummaryRow
            label="Envío"
            value={(serverPricing?.shipping ?? shipping) === 0 ? "Gratis" : formatMoney(serverPricing?.shipping ?? shipping)}
          />

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMoney(serverPricing?.total ?? finalTotal)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pago</Text>

          <View style={styles.paymentRow}>
            <View style={styles.paymentIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color={Colors.light.primary}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.paymentTitle}>Pago seguro con Stripe</Text>
              <Text style={styles.paymentText}>
                Tus datos de tarjeta se procesan directamente por Stripe. ALAIA
                no almacena información bancaria.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Total a pagar</Text>
          <Text style={styles.footerTotal}>{formatMoney(serverPricing?.total ?? finalTotal)}</Text>
        </View>

        <Pressable
          style={[styles.payBtn, !canPay && styles.disabled]}
          onPress={handlePay}
          disabled={!canPay}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card-outline" size={19} color="#fff" />
              <Text style={styles.payText}>Pagar ahora</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Step({
  active,
  label,
  icon,
}: {
  active: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepCircle, active && styles.stepCircleActive]}>
        <Ionicons
          name={icon}
          size={15}
          color={active ? "#FFFFFF" : "#94A3B8"}
        />
      </View>
      <Text style={[styles.stepText, active && styles.stepTextActive]}>
        {label}
      </Text>
    </View>
  );
}

function Input({
  label,
  value,
  onChangeText,
  keyboardType,
  error,
  containerStyle,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: TextInputProps["keyboardType"];
  error?: string;
  containerStyle?: any;
}) {
  return (
    <View style={[styles.inputWrap, containerStyle]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor="#94A3B8"
        style={[styles.input, !!error && styles.inputErrorBorder]}
      />
      {!!error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 20, paddingBottom: 150 },
  title: { fontSize: 30, fontWeight: "900", color: Colors.light.text },
  subtitle: {
    marginTop: 4,
    marginBottom: 18,
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontWeight: "600",
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  warningText: { flex: 1, color: "#1E40AF", fontWeight: "800", fontSize: 12 },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  errorText: { flex: 1, color: "#991B1B", fontWeight: "800", fontSize: 12 },
  progressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
  },
  step: { alignItems: "center", gap: 4 },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: { backgroundColor: Colors.light.primary },
  stepText: { fontSize: 11, color: "#94A3B8", fontWeight: "900" },
  stepTextActive: { color: "#111827" },
  progressLine: { flex: 1, height: 2, backgroundColor: "#E5E7EB", marginHorizontal: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: Colors.light.text,
    marginBottom: 12,
  },
  row: { flexDirection: "row", gap: 10 },
  inputWrap: { marginBottom: 10 },
  inputLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 5,
  },
  input: {
    borderWidth: 1.3,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: "#111827",
    fontWeight: "700",
  },
  inputErrorBorder: { borderColor: "#EF4444" },
  inputError: {
    marginTop: 3,
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "700",
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  checkboxText: { flex: 1, color: "#475569", fontSize: 12, fontWeight: "700" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: { fontSize: 14, fontWeight: "900", color: Colors.light.text },
  itemMeta: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: "600",
  },
  itemPrice: { fontSize: 14, fontWeight: "900", color: Colors.light.primary },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 5,
  },
  summaryLabel: { color: "#6B7280", fontWeight: "700" },
  summaryValue: { color: "#111827", fontWeight: "900" },
  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 18, fontWeight: "900", color: "#111827" },
  totalValue: { fontSize: 21, fontWeight: "900", color: Colors.light.primary },
  paymentRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  paymentIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  paymentTitle: { fontSize: 14, fontWeight: "900", color: Colors.light.text },
  paymentText: {
    marginTop: 3,
    color: Colors.light.textSecondary,
    fontWeight: "600",
    lineHeight: 20,
    fontSize: 13,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 18,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerLabel: { color: "#64748B", fontSize: 12, fontWeight: "800" },
  footerTotal: { color: Colors.light.primary, fontSize: 18, fontWeight: "900" },
  payBtn: {
    flex: 1,
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  disabled: { opacity: 0.55 },
  payText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: Colors.light.background,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: "900",
    color: Colors.light.text,
  },
  emptyText: {
    marginTop: 6,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  secondaryBtn: {
    marginTop: 18,
    borderWidth: 1.5,
    borderColor: Colors.light.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  secondaryText: { color: Colors.light.primary, fontWeight: "900" },
});