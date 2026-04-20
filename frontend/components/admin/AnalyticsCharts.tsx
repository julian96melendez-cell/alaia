"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Item = {
  label: string;
  value: number;
};

function money(value: unknown, currency = "USD") {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(0)}`;
  }
}

function number(value: unknown) {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: 280,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        background: "rgba(15,23,42,.03)",
        color: "rgba(15,23,42,.58)",
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {text}
    </div>
  );
}

function BaseTooltip({
  active,
  payload,
  label,
  isMoney = false,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  isMoney?: boolean;
}) {
  if (!active || !payload || !payload.length) return null;

  const value = Number(payload[0]?.value || 0);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 10px 24px rgba(15,23,42,.10)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "rgba(15,23,42,.55)",
          marginBottom: 4,
        }}
      >
        {label || "Dato"}
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {isMoney ? money(value) : number(value)}
      </div>
    </div>
  );
}

export function OrdersChart({ data }: { data: Item[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState text="No hay datos de órdenes para mostrar." />;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,.08)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "rgba(15,23,42,.58)" }}
            axisLine={{ stroke: "rgba(15,23,42,.10)" }}
            tickLine={{ stroke: "rgba(15,23,42,.10)" }}
          />
          <YAxis
            tickFormatter={(value) => number(value)}
            tick={{ fontSize: 12, fill: "rgba(15,23,42,.58)" }}
            axisLine={{ stroke: "rgba(15,23,42,.10)" }}
            tickLine={{ stroke: "rgba(15,23,42,.10)" }}
          />
          <Tooltip content={<BaseTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#0f172a"
            strokeWidth={2.5}
            fill="rgba(15,23,42,0.12)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueChart({ data }: { data: Item[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState text="No hay datos de ingresos para mostrar." />;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,.08)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "rgba(15,23,42,.58)" }}
            axisLine={{ stroke: "rgba(15,23,42,.10)" }}
            tickLine={{ stroke: "rgba(15,23,42,.10)" }}
          />
          <YAxis
            tickFormatter={(value) => money(value)}
            tick={{ fontSize: 12, fill: "rgba(15,23,42,.58)" }}
            axisLine={{ stroke: "rgba(15,23,42,.10)" }}
            tickLine={{ stroke: "rgba(15,23,42,.10)" }}
          />
          <Tooltip content={<BaseTooltip isMoney />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#16a34a"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}