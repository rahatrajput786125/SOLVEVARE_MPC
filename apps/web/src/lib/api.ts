import axios, { AxiosError } from "axios";

// =============================================================================
// API CLIENT
// =============================================================================

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1",
});

// Inject JWT token on every request
api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("mpc_token")
    : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!(config.data instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
  }
  // Prevent browser from returning 304 cached responses
  config.headers["Cache-Control"] = "no-cache";
  config.headers["Pragma"] = "no-cache";
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: string; message?: string }>) => {
    const isAuthRoute =
      err.config?.url?.includes("/auth/login") ||
      err.config?.url?.includes("/auth/register");

    if (
      err.response?.status === 401 &&
      typeof window !== "undefined" &&
      !isAuthRoute
    ) {
      // 🔴 Fix 1: Poora localStorage clear karo, sirf token nahi
      localStorage.clear();

      // 🔴 Fix 2: Redirect se pehle reject karo taake pending calls ruk jayein
      const error = new Error("Session expired. Please login again.");
      window.location.href = "/login";
      return Promise.reject(error);
    }

    // Normalize error message
    const message =
      err.response?.data?.error ??
      err.response?.data?.message ??
      err.message ??
      "Something went wrong";

    return Promise.reject(new Error(message));
  }
);

// Typed helpers — unwraps { success, data } envelope
export async function apiGet<T>(
  url: string,
  params?: Record<string, unknown>
): Promise<T> {
  const res = await api.get<{ data: T }>(url, { params });
  // 🟡 Fix 4: Explicit check with warning in dev
  if (res.data.data === undefined && process.env.NODE_ENV === "development") {
    console.warn(`[apiGet] No 'data' envelope in response for: ${url}`, res.data);
  }
  return res.data.data ?? (res.data as unknown as T);
}

export async function apiPost<T>(url: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
  const res = await api.post<{ data: T }>(url, body, params ? { params } : undefined);
  return res.data.data ?? (res.data as unknown as T);
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.patch<{ data: T }>(url, body);
  return res.data.data ?? (res.data as unknown as T);
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await api.delete<{ data: T }>(url);
  return res.data.data ?? (res.data as unknown as T);
}