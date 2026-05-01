const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://alaia-production.up.railway.app";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  token?: string | null;
};

export async function apiRequest(path: string, options: ApiOptions = {}) {
  const { method = "GET", body, token } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.message || "Error de API");
  }

  return data;
}

export const AdminOrdersAPI = {
  list: (token: string, params: Record<string, any> = {}) => {
    const qs = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        qs.append(key, String(value));
      }
    });

    const query = qs.toString();
    return apiRequest(`/api/ordenes/admin${query ? `?${query}` : ""}`, {
      token,
    });
  },

  getById: (token: string, id: string) =>
    apiRequest(`/api/ordenes/admin/${id}`, { token }),

  updateFulfillment: (
    token: string,
    id: string,
    estadoFulfillment: string
  ) =>
    apiRequest(`/api/ordenes/admin/${id}/fulfillment`, {
      method: "PUT",
      token,
      body: { estadoFulfillment },
    }),

  updatePayment: (token: string, id: string, estadoPago: string) =>
    apiRequest(`/api/ordenes/admin/${id}/pago`, {
      method: "PUT",
      token,
      body: { estadoPago },
    }),
};