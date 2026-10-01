import { Ionicons } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { apiUrl } from "../../config/api";
import Colors from "../../constants/Colors";
                 
const REFRESH_INTERVAL_MS = 8000;

type Props = {
  ordenId: string;
};

type OrderStatus =
  | "pendiente_pago"
  | "confirmada"
  | "en_preparacion"
  | "en_camino"
  | "entregada"
  | "cancelada";

type PaymentStatus =
  | "pendiente"
  | "autorizado"
  | "pagado"
  | "fallido"
  | "reembolsado";

type TrackingStep = {
  status: OrderStatus;
  title?: string;
  description?: string;
  createdAt?: any;
};

type OrderData = {
  id: string;
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  itemsCount: number;
  createdAt?: any;
  updatedAt?: any;

  tracking: {
    currentStep: OrderStatus;
    history: TrackingStep[];
  };
};

type LoadState =
  | "loading"
  | "ready"
  | "not-found"
  | "error";

const ORDER_STEPS: TrackingStep[] = [
  {
    status: "pendiente_pago",
    title: "Orden creada",
    description: "Tu orden fue registrada.",
  },
  {
    status: "confirmada",
    title: "Orden confirmada",
    description: "El pago fue aprobado.",
  },
  {
    status: "en_preparacion",
    title: "En preparación",
    description: "Estamos preparando tu pedido.",
  },
  {
    status: "en_camino",
    title: "En camino",
    description: "Tu pedido va rumbo a destino.",
  },
  {
    status: "entregada",
    title: "Entregada",
    description: "Pedido entregado correctamente.",
  },
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente_pago: "Pendiente de pago",
  confirmada: "Confirmada",
  en_preparacion: "En preparación",
  en_camino: "En camino",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente_pago: "#F59E0B",
  confirmada: Colors.light.primary,
  en_preparacion: "#7C3AED",
  en_camino: "#2563EB",
  entregada: "#16A34A",
  cancelada: "#DC2626",
};

const STATUS_ICONS: Record<
  OrderStatus,
  keyof typeof Ionicons.glyphMap
> = {
  pendiente_pago: "time-outline",
  confirmada: "checkmark-circle-outline",
  en_preparacion: "cube-outline",
  en_camino: "bicycle-outline",
  entregada: "home-outline",
  cancelada: "close-circle-outline",
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pendiente: "Pendiente",
  autorizado: "Autorizado",
  pagado: "Pagado",
  fallido: "Fallido",
  reembolsado: "Reembolsado",
};

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  pendiente: "#F59E0B",
  autorizado: "#2563EB",
  pagado: "#16A34A",
  fallido: "#DC2626",
  reembolsado: "#64748B",
};

function normalizeStatus(value?: unknown): OrderStatus {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const map: Record<string, OrderStatus> = {
    pendiente_pago: "pendiente_pago",
    pendiente: "pendiente_pago",
    creada: "pendiente_pago",
    creado: "pendiente_pago",

    confirmada: "confirmada",
    confirmado: "confirmada",
    autorizado: "confirmada",
    authorized: "confirmada",
    pagado: "confirmada",
    paid: "confirmada",
    succeeded: "confirmada",

    procesando: "en_preparacion",
    preparando: "en_preparacion",
    preparacion: "en_preparacion",
    preparación: "en_preparacion",
    en_preparacion: "en_preparacion",

    enviado: "en_camino",
    enviada: "en_camino",
    envio: "en_camino",
    en_camino: "en_camino",

    entregado: "entregada",
    entregada: "entregada",

    cancelado: "cancelada",
    cancelada: "cancelada",
    fallido: "cancelada",
    failed: "cancelada",
  };

  return map[status] || "pendiente_pago";
}

function normalizePaymentStatus(
  value?: unknown
): PaymentStatus {
  const status = String(value || "")
    .trim()
    .toLowerCase();

  const map: Record<string, PaymentStatus> = {
    pendiente: "pendiente",
    pending: "pendiente",

    autorizado: "autorizado",
    authorized: "autorizado",

    pagado: "pagado",
    paid: "pagado",
    succeeded: "pagado",

    fallido: "fallido",
    failed: "fallido",

    reembolsado: "reembolsado",
    refunded: "reembolsado",
  };

  return map[status] || "pendiente";
}

function resolveTrackingStatus(data: any): OrderStatus {
  if (data?.tracking?.currentStep) {
    return normalizeStatus(data.tracking.currentStep);
  }

  if (data?.status) {
    return normalizeStatus(data.status);
  }

  const fulfillment = String(
    data?.estadoFulfillment || ""
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  switch (fulfillment) {
    case "procesando":
    case "preparando":
    case "en_preparacion":
      return "en_preparacion";

    case "enviado":
    case "en_camino":
      return "en_camino";

    case "entregado":
    case "entregada":
      return "entregada";

    case "cancelado":
    case "cancelada":
      return "cancelada";
  }

  const payment = normalizePaymentStatus(
    data?.paymentStatus ??
      data?.estadoPago ??
      data?.paymentStatusDetail
  );

  if (
    payment === "pagado" ||
    payment === "autorizado"
  ) {
    return "confirmada";
  }

  if (payment === "fallido") {
    return "cancelada";
  }

  return "pendiente_pago";
}

function parseDate(value?: any): Date | null {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    typeof value?.toDate === "function"
  ) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDate(value?: any) {
  const date = parseDate(value);

  if (!date) {
    return "Pendiente";
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value?: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function normalizeHistoryItem(
  item: any
): TrackingStep | null {
  if (!item) {
    return null;
  }

  const rawStatus =
    item.status ??
    item.estado ??
    item.estadoFulfillment ??
    item.step ??
    item.tipo;

  if (!rawStatus) {
    return null;
  }

  return {
    status: normalizeStatus(rawStatus),

    title:
      item.title ??
      item.titulo ??
      item.nombre ??
      undefined,

    description:
      item.description ??
      item.descripcion ??
      item.detalle ??
      undefined,

    createdAt:
      item.createdAt ??
      item.fecha ??
      item.timestamp ??
      item.updatedAt ??
      null,
  };
}

function buildSyntheticHistory(
  data: any
): TrackingStep[] {
  const history: TrackingStep[] = [];

  history.push({
    status: "pendiente_pago",
    title: "Orden creada",
    description: "Tu orden fue registrada.",
    createdAt: data?.createdAt ?? null,
  });

  const paymentStatus =
    normalizePaymentStatus(
      data?.paymentStatus ??
        data?.estadoPago ??
        data?.paymentStatusDetail
    );

  if (
    paymentStatus === "pagado" ||
    paymentStatus === "autorizado"
  ) {
    history.push({
      status: "confirmada",
      title: "Orden confirmada",
      description: "El pago fue aprobado.",
      createdAt:
        data?.paidAt ??
        data?.updatedAt ??
        data?.createdAt ??
        null,
    });
  }

  const currentStatus =
    resolveTrackingStatus(data);

  if (
    currentStatus === "en_preparacion" ||
    currentStatus === "en_camino" ||
    currentStatus === "entregada"
  ) {
    history.push({
      status: "en_preparacion",
      title: "En preparación",
      description: "Estamos preparando tu pedido.",
      createdAt:
        currentStatus === "en_preparacion"
          ? data?.updatedAt ?? null
          : null,
    });
  }

  if (
    currentStatus === "en_camino" ||
    currentStatus === "entregada"
  ) {
    history.push({
      status: "en_camino",
      title: "En camino",
      description: "Tu pedido va rumbo a destino.",
      createdAt:
        currentStatus === "en_camino"
          ? data?.updatedAt ?? null
          : null,
    });
  }

  if (currentStatus === "entregada") {
    history.push({
      status: "entregada",
      title: "Entregada",
      description: "Pedido entregado correctamente.",
      createdAt: data?.updatedAt ?? null,
    });
  }

  return history;
}

function normalizeOrder(
  id: string,
  data: any
): OrderData {
  const currentStep =
    resolveTrackingStatus(data);

  const paymentStatus =
    normalizePaymentStatus(
      data?.paymentStatus ??
        data?.estadoPago ??
        data?.paymentStatusDetail
    );

  let itemsCount = Number(
    data?.itemsCount ?? 0
  );

  if (
    !itemsCount &&
    Array.isArray(data?.items)
  ) {
    itemsCount = data.items.reduce(
      (acc: number, item: any) => {
        return (
          acc +
          Number(
            item?.cantidad ??
              item?.quantity ??
              1
          )
        );
      },
      0
    );
  }

  let rawHistory: any[] = [];

  if (
    Array.isArray(
      data?.tracking?.history
    )
  ) {
    rawHistory =
      data.tracking.history;
  } else if (
    Array.isArray(data?.history)
  ) {
    rawHistory = data.history;
  } else if (
    Array.isArray(data?.historial)
  ) {
    rawHistory = data.historial;
  } else if (
    Array.isArray(
      data?.historialEstados
    )
  ) {
    rawHistory =
      data.historialEstados;
  }

  let history = rawHistory
    .map((item: any) =>
      normalizeHistoryItem(item)
    )
    .filter(
      (
        item
      ): item is TrackingStep =>
        item !== null
    );

  if (!history.length) {
    history =
      buildSyntheticHistory(data);
  }

  const uniqueHistory =
    new Map<
      OrderStatus,
      TrackingStep
    >();

  history.forEach((item) => {
    uniqueHistory.set(
      item.status,
      item
    );
  });

  history = Array.from(
    uniqueHistory.values()
  );

  return {
    id,

    orderId: String(
      data?.orderId ??
        data?._id ??
        data?.id ??
        id
    ),

    status: currentStep,

    paymentStatus,

    total: Number(
      data?.total ??
        data?.pricing?.total ??
        0
    ),

    itemsCount,

    createdAt:
      data?.createdAt ?? null,

    updatedAt:
      data?.updatedAt ?? null,

    tracking: {
      currentStep,
      history,
    },
  };
}

export default function TrackingClient({
  ordenId,
}: Props) {
  const [order, setOrder] =
    useState<OrderData | null>(
      null
    );

  const [state, setState] =
    useState<LoadState>(
      "loading"
    );

  const [error, setError] =
    useState<string | null>(
      null
    );

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const mountedRef =
    useRef(true);

  const isFetchingRef =
    useRef(false);

  const hasLoadedRef =
    useRef(false);

  const cleanOrdenId =
    useMemo(
      () =>
        String(
          ordenId || ""
        ).trim(),
      [ordenId]
    );

  const loadOrder =
    useCallback(
      async (
        options?: {
          showLoading?: boolean;
          silent?: boolean;
        }
      ) => {
        const showLoading =
          options?.showLoading ??
          false;

        const silent =
          options?.silent ??
          false;

        if (!cleanOrdenId) {
          if (
            mountedRef.current
          ) {
            setOrder(null);

            setError(
              "ID de orden inválido."
            );

            setState(
              "error"
            );
          }

          return;
        }

        if (
          isFetchingRef.current
        ) {
          return;
        }

        isFetchingRef.current =
          true;

        try {
          if (
            showLoading &&
            mountedRef.current
          ) {
            setState(
              "loading"
            );
          }

          const url =
            apiUrl(`/api/ordenes/public/${encodeURIComponent(cleanOrdenId)}`);

          console.log(
            "TRACKING REQUEST:",
            url
          );

          const response =
            await fetch(url, {
              method: "GET",
              headers: {
                Accept:
                  "application/json",
              },
            });

          const text =
            await response.text();

          let json: any =
            null;

          try {
            json = text
              ? JSON.parse(text)
              : null;
          } catch {
            throw new Error(
              "El servidor devolvió una respuesta inválida."
            );
          }

          if (
            response.status ===
            404
          ) {
            if (
              mountedRef.current
            ) {
              setOrder(null);

              setError(null);

              setState(
                "not-found"
              );
            }

            return;
          }

          if (
            !response.ok
          ) {
            throw new Error(
              json?.message ||
                json?.error ||
                `Error del servidor (${response.status}).`
            );
          }

          const rawOrder =
            json?.data ??
            json?.orden ??
            json?.order ??
            json;

          if (!rawOrder) {
            throw new Error(
              "El backend respondió sin información de la orden."
            );
          }

          const normalized =
            normalizeOrder(
              cleanOrdenId,
              rawOrder
            );

          if (
            !mountedRef.current
          ) {
            return;
          }

          hasLoadedRef.current =
            true;

          setOrder(
            normalized
          );

          setError(null);

          setState(
            "ready"
          );
        } catch (
          err: any
        ) {
          console.log(
            "TRACKING LOAD ERROR:",
            err
          );

          if (
            !mountedRef.current
          ) {
            return;
          }

          if (
            silent &&
            hasLoadedRef.current
          ) {
            return;
          }

          setOrder(null);

          setError(
            err?.message ||
              "No fue posible obtener la orden."
          );

          setState(
            "error"
          );
        } finally {
          isFetchingRef.current =
            false;
        }
      },
      [cleanOrdenId]
    );

  useEffect(() => {
    mountedRef.current =
      true;

    hasLoadedRef.current =
      false;

    loadOrder({
      showLoading: true,
      silent: false,
    });

    return () => {
      mountedRef.current =
        false;
    };
  }, [loadOrder]);

  useEffect(() => {
    if (
      state !== "ready"
    ) {
      return;
    }

    const interval =
      setInterval(() => {
        loadOrder({
          showLoading: false,
          silent: true,
        });
      }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(
        interval
      );
    };
  }, [
    loadOrder,
    state,
  ]);

  const reload =
    useCallback(
      async () => {
        setRefreshing(
          true
        );

        try {
          await loadOrder({
            showLoading:
              false,
            silent: false,
          });
        } finally {
          if (
            mountedRef.current
          ) {
            setRefreshing(
              false
            );
          }
        }
      },
      [loadOrder]
    );

  const currentStatus =
    useMemo(
      () =>
        order?.tracking
          .currentStep ??
        order?.status ??
        "pendiente_pago",
      [order]
    );

  const currentStatusColor =
    STATUS_COLORS[
      currentStatus
    ];

  const currentStatusLabel =
    STATUS_LABELS[
      currentStatus
    ];

  const currentStatusIcon =
    STATUS_ICONS[
      currentStatus
    ];

  const paymentStatus =
    order?.paymentStatus ??
    "pendiente";

  const paymentColor =
    PAYMENT_COLORS[
      paymentStatus
    ];

  const paymentLabel =
    PAYMENT_LABELS[
      paymentStatus
    ];

  const historyMap =
    useMemo(() => {
      const map =
        new Map<
          OrderStatus,
          TrackingStep
        >();

      (
        order?.tracking
          .history ?? []
      ).forEach(
        (item) => {
          map.set(
            item.status,
            item
          );
        }
      );

      return map;
    }, [order]);

  const steps =
    useMemo(() => {
      const foundIndex =
        ORDER_STEPS.findIndex(
          (item) =>
            item.status ===
            currentStatus
        );

      const currentIndex =
        foundIndex >= 0
          ? foundIndex
          : 0;

      return ORDER_STEPS.map(
        (
          step,
          index
        ) => {
          const found =
            historyMap.get(
              step.status
            );

          const completed =
            currentStatus ===
            "cancelada"
              ? index <
                currentIndex
              : index <
                  currentIndex ||
                currentStatus ===
                  "entregada";

          return {
            ...step,
            ...found,

            isCompleted:
              completed,

            isCurrent:
              index ===
                currentIndex &&
              currentStatus !==
                "entregada" &&
              currentStatus !==
                "cancelada",
          };
        }
      );
    }, [
      currentStatus,
      historyMap,
    ]);

  if (
    state === "loading"
  ) {
    return (
      <StateView
        icon="bicycle-outline"
        title="Cargando seguimiento..."
        text="Estamos obteniendo el estado más reciente de tu orden."
        loading
      />
    );
  }

  if (
    state ===
    "not-found"
  ) {
    return (
      <StateView
        icon="alert-circle-outline"
        title="Orden no encontrada"
        text={`No encontramos una orden con el ID ${cleanOrdenId}.`}
        actionLabel="Reintentar"
        onAction={() =>
          loadOrder({
            showLoading:
              true,
            silent: false,
          })
        }
      />
    );
  }

  if (
    state === "error"
  ) {
    return (
      <StateView
        icon="cloud-offline-outline"
        title="Error"
        text={
          error ||
          "No fue posible cargar la orden."
        }
        actionLabel="Reintentar"
        onAction={() =>
          loadOrder({
            showLoading:
              true,
            silent: false,
          })
        }
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={
        styles.container
      }
      showsVerticalScrollIndicator={
        false
      }
      refreshControl={
        <RefreshControl
          refreshing={
            refreshing
          }
          onRefresh={
            reload
          }
          tintColor={
            Colors.light
              .primary
          }
        />
      }
    >
      <View
        style={
          styles.heroCard
        }
      >
        <View
          style={[
            styles.heroIcon,
            {
              backgroundColor:
                currentStatusColor,
            },
          ]}
        >
          <Ionicons
            name={
              currentStatusIcon
            }
            color="#fff"
            size={28}
          />
        </View>

        <View
          style={{
            flex: 1,
          }}
        >
          <Text
            style={
              styles.title
            }
          >
            Seguimiento de tu
            orden
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Orden #
            {order?.orderId}
          </Text>

          <Text
            style={
              styles.orderDate
            }
          >
            Creada:{" "}
            {formatDate(
              order?.createdAt
            )}
          </Text>
        </View>
      </View>

      <View
        style={
          styles.statusCard
        }
      >
        <View
          style={
            styles.statusTop
          }
        >
          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={
                styles.statusLabel
              }
            >
              Estado actual
            </Text>

            <Text
              style={
                styles.statusValue
              }
            >
              {
                currentStatusLabel
              }
            </Text>
          </View>

          <View
            style={[
              styles.liveBadge,
              {
                backgroundColor:
                  `${currentStatusColor}22`,
              },
            ]}
          >
            <Ionicons
              name="radio-outline"
              color={
                currentStatusColor
              }
              size={14}
            />

            <Text
              style={[
                styles.liveText,
                {
                  color:
                    currentStatusColor,
                },
              ]}
            >
              En vivo
            </Text>
          </View>
        </View>

        <View
          style={
            styles.infoGrid
          }
        >
          <InfoItem
            icon="cube-outline"
            label="Productos"
            value={`${order?.itemsCount ?? 0}`}
          />

          <InfoItem
            icon="cash-outline"
            label="Total"
            value={formatMoney(
              order?.total
            )}
          />

          <InfoItem
            icon="card-outline"
            label="Pago"
            value={
              paymentLabel
            }
            color={
              paymentColor
            }
          />
        </View>

        <View
          style={
            styles.paymentStatusBox
          }
        >
          <View
            style={[
              styles.paymentDot,
              {
                backgroundColor:
                  paymentColor,
              },
            ]}
          />

          <Text
            style={[
              styles.paymentStatusText,
              {
                color:
                  paymentColor,
              },
            ]}
          >
            Estado de pago:{" "}
            {paymentLabel}
          </Text>
        </View>
      </View>

      <Text
        style={
          styles.sectionTitle
        }
      >
        Historial
      </Text>

      <View
        style={
          styles.timelineCard
        }
      >
        {steps.map(
          (
            item,
            index
          ) => {
            const active =
              item.isCompleted ||
              item.isCurrent;

            const dotColor =
              item.isCurrent
                ? currentStatusColor
                : item.isCompleted
                ? Colors
                    .light
                    .primary
                : "#CBD5E1";

            return (
              <View
                key={
                  item.status
                }
                style={
                  styles.timelineRow
                }
              >
                <View
                  style={
                    styles.timelineLeft
                  }
                >
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          dotColor,
                      },
                    ]}
                  >
                    {item.isCompleted ? (
                      <Ionicons
                        name="checkmark"
                        color="#fff"
                        size={13}
                      />
                    ) : item.isCurrent ? (
                      <Ionicons
                        name="ellipse"
                        color="#fff"
                        size={8}
                      />
                    ) : (
                      <Ionicons
                        name="time-outline"
                        color="#fff"
                        size={13}
                      />
                    )}
                  </View>

                  {index !==
                    steps.length -
                      1 && (
                    <View
                      style={[
                        styles.line,
                        active && {
                          backgroundColor:
                            `${Colors.light.primary}55`,
                        },
                      ]}
                    />
                  )}
                </View>

                <View
                  style={
                    styles.timelineContent
                  }
                >
                  <Text
                    style={[
                      styles.timelineTitle,
                      !active &&
                        styles.timelineTitlePending,
                    ]}
                  >
                    {
                      item.title
                    }
                  </Text>

                  <Text
                    style={
                      styles.timelineDescription
                    }
                  >
                    {item.description ||
                      "Pendiente de actualización."}
                  </Text>

                  <Text
                    style={
                      styles.timelineDate
                    }
                  >
                    {formatDate(
                      item.createdAt
                    )}
                  </Text>
                </View>
              </View>
            );
          }
        )}
      </View>

      {currentStatus ===
      "cancelada" ? (
        <View
          style={
            styles.cancelCard
          }
        >
          <Ionicons
            name="alert-circle-outline"
            color="#DC2626"
            size={18}
          />

          <Text
            style={
              styles.cancelText
            }
          >
            La orden fue
            cancelada. Si el pago
            fue realizado, el
            reembolso seguirá la
            política establecida.
          </Text>
        </View>
      ) : (
        <View
          style={
            styles.noteCard
          }
        >
          <Ionicons
            name="shield-checkmark-outline"
            color="#16A34A"
            size={18}
          />

          <Text
            style={
              styles.footerNote
            }
          >
            Este seguimiento se
            actualiza
            automáticamente
            consultando el estado
            real de la orden en el
            servidor.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const InfoItem = ({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color?: string;
}) => {
  return (
    <View
      style={
        styles.infoItem
      }
    >
      <Ionicons
        name={icon}
        size={18}
        color={
          color ??
          Colors.light
            .primary
        }
      />

      <Text
        style={
          styles.infoLabel
        }
      >
        {label}
      </Text>

      <Text
        numberOfLines={1}
        style={[
          styles.infoValue,
          color
            ? { color }
            : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
};

const StateView = ({
  icon,
  title,
  text,
  loading,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) => {
  return (
    <View
      style={
        styles.center
      }
    >
      <View
        style={
          styles.stateIcon
        }
      >
        {loading ? (
          <ActivityIndicator
            color={
              Colors.light
                .primary
            }
          />
        ) : (
          <Ionicons
            name={icon}
            size={40}
            color={
              Colors.light
                .primary
            }
          />
        )}
      </View>

      <Text
        style={
          styles.emptyTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.emptyText
        }
      >
        {text}
      </Text>

      {!!actionLabel &&
        !!onAction && (
          <Pressable
            style={
              styles.retryBtn
            }
            onPress={
              onAction
            }
          >
            <Ionicons
              name="refresh-outline"
              color="#fff"
              size={17}
            />

            <Text
              style={
                styles.retryText
              }
            >
              {
                actionLabel
              }
            </Text>
          </Pressable>
        )}
    </View>
  );
};

const styles =
  StyleSheet.create({
    container: {
      paddingTop: 20,
      paddingHorizontal: 16,
      paddingBottom: 40,
    },

    heroCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: "#fff",
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      elevation: 1,
    },

    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
    },

    title: {
      fontSize: 16,
      fontWeight: "700",
      color: "#0F172A",
    },

    subtitle: {
      fontSize: 13,
      color: "#475569",
      marginTop: 2,
    },

    orderDate: {
      fontSize: 12,
      color: "#94A3B8",
      marginTop: 4,
    },

    statusCard: {
      backgroundColor: "#fff",
      borderRadius: 18,
      padding: 16,
      marginBottom: 20,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      elevation: 1,
    },

    statusTop: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
    },

    statusLabel: {
      fontSize: 12,
      color: "#94A3B8",
    },

    statusValue: {
      fontSize: 17,
      fontWeight: "700",
      color: "#0F172A",
      marginTop: 2,
    },

    liveBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },

    liveText: {
      fontSize: 12,
      fontWeight: "600",
    },

    infoGrid: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },

    infoItem: {
      flex: 1,
      minHeight: 74,
      backgroundColor:
        "#F8FAFC",
      borderRadius: 14,
      padding: 10,
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
    },

    infoLabel: {
      fontSize: 11,
      color: "#94A3B8",
      marginTop: 6,
    },

    infoValue: {
      fontSize: 13,
      fontWeight: "700",
      color: "#0F172A",
      marginTop: 2,
    },

    paymentStatusBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor:
        "#F1F5F9",
    },

    paymentDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },

    paymentStatusText: {
      fontSize: 13,
      fontWeight: "600",
    },

    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: "#0F172A",
      marginBottom: 10,
    },

    timelineCard: {
      backgroundColor: "#fff",
      borderRadius: 18,
      padding: 16,
      marginBottom: 20,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      elevation: 1,
    },

    timelineRow: {
      flexDirection: "row",
      alignItems:
        "flex-start",
    },

    timelineLeft: {
      alignItems: "center",
      width: 28,
    },

    dot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent:
        "center",
    },

    line: {
      width: 2,
      flex: 1,
      minHeight: 30,
      backgroundColor:
        "#E2E8F0",
      borderRadius: 999,
      marginVertical: 2,
    },

    timelineContent: {
      flex: 1,
      paddingBottom: 18,
      paddingLeft: 10,
    },

    timelineTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: "#0F172A",
    },

    timelineTitlePending: {
      color: "#94A3B8",
    },

    timelineDescription: {
      fontSize: 12,
      color: "#64748B",
      marginTop: 2,
    },

    timelineDate: {
      fontSize: 11,
      color: "#CBD5E1",
      marginTop: 4,
    },

    cancelCard: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 10,
      backgroundColor:
        "#FEF2F2",
      borderRadius: 14,
      padding: 14,
      overflow: "hidden",
    },

    cancelText: {
      flex: 1,
      fontSize: 13,
      color: "#B91C1C",
      lineHeight: 18,
    },

    noteCard: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 10,
      backgroundColor:
        "#F0FDF4",
      borderRadius: 14,
      padding: 14,
      overflow: "hidden",
    },

    footerNote: {
      flex: 1,
      fontSize: 13,
      color: "#166534",
      lineHeight: 18,
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      paddingHorizontal: 30,
      paddingTop: 80,
    },

    stateIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor:
        "#F1F5F9",
      alignItems: "center",
      justifyContent:
        "center",
      marginBottom: 16,
    },

    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: "#0F172A",
      marginBottom: 6,
      textAlign: "center",
    },

    emptyText: {
      fontSize: 13,
      color: "#64748B",
      textAlign: "center",
      lineHeight: 19,
    },

    retryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor:
        Colors.light.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      marginTop: 18,
      elevation: 1,
    },

    retryText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 13,
    },

    refreshIndicator: {
      marginTop: 12,
    },

    skeleton: {
      backgroundColor:
        "#F3F4F6",
    },

    hidden: {
      display: "none",
    },
  });