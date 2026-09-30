"use client";

import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

type ChartPoint = {
  label: string;
  value: number;
};

function EmptyChart({ text }: { text: string }) {
  return (
    <div
      style={{
        height: 280,
        display: "grid",
        placeItems: "center",
        borderRadius: 16,
        background: "rgba(248,250,252,.9)",
        color: "rgba(15,23,42,.55)",
        fontWeight: 800,
      }}
    >
      {text}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,.12)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 12px 28px rgba(15,23,42,.12)",
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(15,23,42,.55)" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>
        {Number(payload[0]?.value || 0).toLocaleString("es-ES")}
      </div>
    </div>
  );
}

export function OrdersChart({ data }: { data: ChartPoint[] }) {
  if (!data?.length) {
    return <EmptyChart text="No hay datos de órdenes disponibles." />;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,.08)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#4F46E5" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueChart({ data }: { data: ChartPoint[] }) {
  if (!data?.length) {
    return <EmptyChart text="No hay datos de ingresos disponibles." />;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#16A34A" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#16A34A" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,.08)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} />
          <Tooltip content={<ChartTooltip />} />

          <Area
            type="monotone"
            dataKey="value"
            stroke="#16A34A"
            strokeWidth={3}
            fill="url(#revenueGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}