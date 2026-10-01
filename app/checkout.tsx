import { Ionicons } from "@expo/vector-icons";
import { useStripe } from "@stripe/stripe-react-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiUrl } from "../config/api";
import { auth } from "../firebase/firebaseConfig";
import { requestCheckout, pricingChanged, CheckoutError, CheckoutPayment, CheckoutPricing, ShippingAddress } from "../services/checkout";

import Colors from "../constants/Colors";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

const TAX_PERCENT = 0.07;


const RETURN_URL = "alaiaclean://stripe-redirect";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function isMongoObjectId(value: unknown) {
  return (
    typeof value === "string" &&
    /^[a-f\d]{24}$/i.test(value.trim())
  );
}

export default function CheckoutScreen() {
  const router = useRouter();

  const {
    initPaymentSheet,
    presentPaymentSheet,
  } = useStripe();

  const { user } = useAuth();

  const {
    items,
    subtotal,
    shipping,
    discount,
    total,
    coupon,
    clearCart,
  } = useCart();

  const [processing, setProcessing] =
    useState(false);

  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({ fullName: user?.displayName || "", phone: "", street: "", city: "", state: "", zip: "" });
  const [serverPricing, setServerPricing] = useState<CheckoutPricing | null>(null);
  const processingRef = useRef(false);
  const paymentRef = useRef<{ fingerprint: string; payment: CheckoutPayment } | null>(null);
  const uncertainRef = useRef(false);
  const completedRef = useRef(false);
  useEffect(() => { setServerPricing(null); }, [items, coupon?.code, shippingAddress, user?.uid]);

  const tax = useMemo(
    () =>
      Number(
        (
          Number(subtotal || 0) *
          TAX_PERCENT
        ).toFixed(2)
      ),
    [subtotal]
  );

  const finalTotal = useMemo(
    () =>
      Number(
        (
          Number(total || 0) +
          tax
        ).toFixed(2)
      ),
    [total, tax]
  );

  const validateCartForMongo = () => {
    const invalidItem = items.find(
      (item) =>
        !isMongoObjectId(
          item.id
        )
    );

    if (invalidItem) {
      throw new CheckoutError("PRODUCT", "Un producto no es válido. Revisa el carrito antes de pagar.");
    }
  };

  const requestPaymentIntent = async (): Promise<CheckoutPayment> => {
    validateCartForMongo();
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || firebaseUser.uid !== user?.uid) throw new CheckoutError("SESSION", "Inicia sesión de nuevo para continuar.");
    if (uncertainRef.current) throw new CheckoutError("NETWORK", "El resultado de la solicitud anterior es incierto. Revisa tus órdenes antes de volver a pagar.");
    const input = { items: items.map(item => ({ producto: item.id, cantidad: Number(item.quantity) })), couponCode: coupon?.code || "", shippingAddress };
    const fingerprint = JSON.stringify({ uid: firebaseUser.uid, ...input });
    if (paymentRef.current?.fingerprint === fingerprint) return paymentRef.current.payment;
    try {
      const payment = await requestCheckout(firebaseUser, apiUrl("/api/stripe/payment-sheet"), input);
      paymentRef.current = { fingerprint, payment };
      return payment;
    } catch (error) {
      if (error instanceof CheckoutError && ["NETWORK", "RESPONSE", "SERVER", "STRIPE"].includes(error.code)) uncertainRef.current = true;
      throw error;
    }
  };

  const handlePay =
    async () => {
      if (completedRef.current) {
        Alert.alert("Pago recibido / verificando", "Revisa tu orden en el historial o seguimiento antes de iniciar otro pago.");
        return;
      }
      if (processingRef.current) {
        return;
      }

      if (!user?.uid) {
        Alert.alert(
          "Sesión requerida",
          "Debes iniciar sesión para continuar."
        );

        router.replace(
          "/(auth)/login" as any
        );

        return;
      }

      if (!items.length) {
        Alert.alert(
          "Carrito vacío",
          "Añade productos antes de pagar."
        );

        return;
      }

      try {
        processingRef.current = true;
        setProcessing(true);

        const paymentData =
          await requestPaymentIntent();

        const displayedPricing = serverPricing || { subtotal, tax, shipping, discount, total: finalTotal };
        setServerPricing(paymentData.pricing);
        if (pricingChanged(displayedPricing, paymentData.pricing)) {
          Alert.alert("Importe actualizado", "El backend actualizó el resumen. Revísalo y vuelve a pulsar Pagar para confirmar el importe antes de abrir Stripe.");
          return;
        }
        if (auth.currentUser?.uid !== user?.uid) throw new CheckoutError("SESSION", "Tu sesión cambió. Inicia sesión de nuevo.");

        const initResult =
          await initPaymentSheet(
            {
              merchantDisplayName:
                "ALAIA",

              paymentIntentClientSecret:
                paymentData.clientSecret,

              returnURL:
                RETURN_URL,

              allowsDelayedPaymentMethods:
                false,

              defaultBillingDetails:
                {
                  email:
                    user.email ||
                    undefined,
                },
            }
          );

        if (
          initResult.error
        ) {
          throw new CheckoutError("STRIPE", "Stripe no pudo preparar el pago. El carrito se conserva.");
        }

        const paymentResult =
          await presentPaymentSheet();

        if (
          paymentResult.error
        ) {
          if (
            paymentResult.error
              .code ===
            "Canceled"
          ) {
            Alert.alert(
              "Pago cancelado",
              "La orden quedó pendiente. Puedes intentarlo nuevamente."
            );

            return;
          }

          throw new CheckoutError("STRIPE", "Stripe no pudo completar el pago. Revisa tus órdenes antes de reintentar.");
        }

        /*
         * Ya no guardamos una copia de la orden
         * en Firestore.
         *
         * MongoDB/backend es ahora la fuente
         * oficial de la orden.
         */

        completedRef.current = true;
        try { await clearCart(); } catch { Alert.alert("Carrito pendiente", "El pago terminó en el dispositivo. El carrito no pudo limpiarse; revisa el historial antes de pagar otra vez."); }

        const trackingId = paymentData.ordenId;

        if (
          !isMongoObjectId(
            trackingId
          )
        ) {
          throw new Error(
            "El pago fue aprobado, pero no recibimos un ID válido para mostrar el seguimiento."
          );
        }

        Alert.alert(
          "Pago recibido / verificando",
          "Stripe completó el flujo en el dispositivo. Verifica el estado final de la orden en el seguimiento.",
          [
            {
              text:
                "Ver seguimiento",

              onPress: () =>
                router.replace(
                  `/track/${trackingId}` as any
                ),
            },
            {
              text:
                "Ver órdenes",

              onPress: () =>
                router.replace(
                  "/(tabs)/orders" as any
                ),
            },
          ]
        );
      } catch (
        err: any
      ) {
        Alert.alert(
          "No se pudo completar el pago",
          err instanceof CheckoutError ? err.message : "No se pudo completar el proceso. El carrito se conserva; revisa tus órdenes antes de reintentar."
        );
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    };

  if (!items.length) {
    return (
      <View
        style={
          styles.center
        }
      >
        <Ionicons
          name="cart-outline"
          size={52}
          color="#94A3B8"
        />

        <Text
          style={
            styles.emptyTitle
          }
        >
          Tu carrito está vacío
        </Text>

        <Text
          style={
            styles.emptyText
          }
        >
          Añade productos antes
          de continuar al
          checkout.
        </Text>

        <Pressable
          style={
            styles.secondaryBtn
          }
          onPress={() =>
            router.replace(
              "/(tabs)/cart" as any
            )
          }
        >
          <Text
            style={
              styles.secondaryText
            }
          >
            Volver al carrito
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={
        styles.container
      }
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <Text
          style={
            styles.title
          }
        >
          Checkout
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Revisa tus productos
          y paga de forma segura
          con Stripe.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dirección de entrega</Text>
          {([['fullName', 'Nombre completo'], ['phone', 'Teléfono'], ['street', 'Dirección'], ['city', 'Ciudad'], ['state', 'Provincia / estado'], ['zip', 'Código postal']] as const).map(([field, label]) => (
            <View key={field} style={{ marginBottom: 12 }}>
              <Text>{label}</Text>
              <TextInput accessibilityLabel={label} value={shippingAddress[field]} editable={!processing}
                onChangeText={value => setShippingAddress(previous => ({ ...previous, [field]: value }))}
                keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
                style={{ borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 12 }} />
            </View>
          ))}
        </View>

        <View
          style={
            styles.card
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Productos
          </Text>

          {items.map(
            (item) => (
              <View
                key={
                  item.id
                }
                style={
                  styles.itemRow
                }
              >
                <View
                  style={
                    styles.itemIcon
                  }
                >
                  <Ionicons
                    name="cube-outline"
                    size={20}
                    color={
                      Colors
                        .light
                        .primary
                    }
                  />
                </View>

                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={
                      styles.itemName
                    }
                    numberOfLines={
                      2
                    }
                  >
                    {item.name}
                  </Text>

                  <Text
                    style={
                      styles.itemQty
                    }
                  >
                    Cantidad:{" "}
                    {
                      item.quantity
                    }
                  </Text>
                </View>

                <Text
                  style={
                    styles.itemPrice
                  }
                >
                  {formatMoney(
                    Number(
                      item.price ||
                        0
                    ) *
                      Number(
                        item.quantity ||
                          1
                      )
                  )}
                </Text>
              </View>
            )
          )}
        </View>

        <View
          style={
            styles.card
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Resumen
          </Text>

          <SummaryRow
            label="Subtotal"
            value={formatMoney(
              serverPricing?.subtotal ?? subtotal
            )}
          />

          <SummaryRow
            label="Impuestos"
            value={formatMoney(
              serverPricing?.tax ?? tax
            )}
          />

          <SummaryRow
            label="Descuento"
            value={`-${formatMoney(
              serverPricing?.discount ?? discount
            )}`}
          />

          <SummaryRow
            label="Envío"
            value={
              (serverPricing?.shipping ?? shipping) === 0
                ? "Gratis"
                : formatMoney(
                    serverPricing?.shipping ?? shipping
                  )
            }
          />

          <View
            style={
              styles.divider
            }
          />

          <View
            style={
              styles.totalRow
            }
          >
            <Text
              style={
                styles.totalLabel
              }
            >
              Total
            </Text>

            <Text
              style={
                styles.totalValue
              }
            >
              {formatMoney(
                serverPricing?.total ?? finalTotal
              )}
            </Text>
          </View>
        </View>

        <View
          style={
            styles.card
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Pago
          </Text>

          <View
            style={
              styles.paymentRow
            }
          >
            <View
              style={
                styles.paymentIcon
              }
            >
              <Ionicons
                name="card-outline"
                size={20}
                color={
                  Colors
                    .light
                    .primary
                }
              />
            </View>

            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={
                  styles.paymentTitle
                }
              >
                Pago seguro con
                Stripe
              </Text>

              <Text
                style={
                  styles.paymentText
                }
              >
                Al tocar pagar,
                se abrirá Stripe
                PaymentSheet para
                completar el pago
                real con tarjeta.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={
          styles.footer
        }
      >
        <Pressable
          style={[
            styles.payBtn,
            processing &&
              styles.disabled,
          ]}
          onPress={
            handlePay
          }
          disabled={
            processing
          }
        >
          {processing ? (
            <ActivityIndicator
              color="#fff"
            />
          ) : (
            <>
              <Ionicons
                name="card-outline"
                size={19}
                color="#fff"
              />

              <Text
                style={
                  styles.payText
                }
              >
                Pagar ahora
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.summaryRow
      }
    >
      <Text
        style={
          styles.summaryLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.summaryValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        Colors.light
          .background,
    },

    content: {
      padding: 20,
      paddingBottom: 130,
    },

    title: {
      fontSize: 28,
      fontWeight: "900",
      color:
        Colors.light.text,
    },

    subtitle: {
      marginTop: 4,
      marginBottom: 18,
      fontSize: 13,
      color:
        Colors.light
          .textSecondary,
      fontWeight: "600",
      lineHeight: 19,
    },

    card: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 20,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor:
        "#E5E7EB",
    },

    sectionTitle: {
      fontSize: 16,
      fontWeight: "900",
      color:
        Colors.light.text,
      marginBottom: 12,
    },

    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor:
        "#F1F5F9",
    },

    itemIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor:
        "#EEF2FF",
      alignItems: "center",
      justifyContent:
        "center",
    },

    itemName: {
      fontSize: 14,
      fontWeight: "800",
      color:
        Colors.light.text,
    },

    itemQty: {
      marginTop: 2,
      fontSize: 12,
      color:
        Colors.light
          .textSecondary,
      fontWeight: "600",
    },

    itemPrice: {
      fontSize: 14,
      fontWeight: "900",
      color:
        Colors.light
          .primary,
    },

    summaryRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      marginVertical: 4,
    },

    summaryLabel: {
      color: "#6B7280",
      fontWeight: "700",
    },

    summaryValue: {
      color: "#111827",
      fontWeight: "800",
    },

    divider: {
      height: 1,
      backgroundColor:
        "#E5E7EB",
      marginVertical: 10,
    },

    totalRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
    },

    totalLabel: {
      fontSize: 17,
      fontWeight: "900",
      color: "#111827",
    },

    totalValue: {
      fontSize: 19,
      fontWeight: "900",
      color:
        Colors.light
          .primary,
    },

    paymentRow: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 12,
    },

    paymentIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor:
        "#EEF2FF",
      alignItems: "center",
      justifyContent:
        "center",
    },

    paymentTitle: {
      fontSize: 14,
      fontWeight: "900",
      color:
        Colors.light.text,
      marginBottom: 3,
    },

    paymentText: {
      color:
        Colors.light
          .textSecondary,
      fontWeight: "600",
      lineHeight: 20,
      fontSize: 13,
    },

    footer: {
      position:
        "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 18,
      backgroundColor:
        "#FFFFFF",
      borderTopWidth: 1,
      borderTopColor:
        "#E5E7EB",
    },

    payBtn: {
      backgroundColor:
        Colors.light
          .primary,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent:
        "center",
      flexDirection: "row",
      gap: 8,
    },

    disabled: {
      opacity: 0.65,
    },

    payText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "900",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      padding: 28,
      backgroundColor:
        Colors.light
          .background,
    },

    emptyTitle: {
      marginTop: 12,
      fontSize: 20,
      fontWeight: "900",
      color:
        Colors.light.text,
    },

    emptyText: {
      marginTop: 6,
      color:
        Colors.light
          .textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },

    secondaryBtn: {
      marginTop: 18,
      borderWidth: 1.5,
      borderColor:
        Colors.light
          .primary,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 999,
    },

    secondaryText: {
      color:
        Colors.light
          .primary,
      fontWeight: "900",
    },
  });