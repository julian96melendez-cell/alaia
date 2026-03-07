// lib/api.ts — HTTP client para Expo / Mobile

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "http://localhost:3001";

export type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const json = await res.json().catch(() => null);

    // Backend enterprise
    if (json && typeof json === "object" && "ok" in json) {
      return json as ApiResponse<T>;
    }

    // Backend legacy
    return {
      ok: res.ok,
      data: json as T,
      message: res.ok ? "OK" : "Error de servidor",
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Error de red",
    };
  }
}

export const api = {
  get<T>(path: string) {
    return request<T>(path);
  },
  post<T>(path: string, body?: any) {
    return request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  put<T>(path: string, body?: any) {
    return request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
};