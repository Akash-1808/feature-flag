"use client";

/**
 * Centralized API client wrapper for Next.js dashboard.
 * - Handles JSON serialization/deserialization.
 * - Automatically passes `credentials: 'include'` for Better Auth cookies.
 * - Intercepts 401 Unauthorized responses and redirects to `/login`.
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
  success?: boolean;
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Essential for Better Auth cookie forwarding
  });

  if (response.status === 401) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMsg =
      typeof data === "object" && data !== null && (data.error?.message || data.message || data.error)
        ? data.error?.message || data.message || typeof data.error === "string" ? data.error : JSON.stringify(data.error)
        : `HTTP Error ${response.status}: ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const apiClient = {
  get: <T = any>(url: string, options?: RequestInit) =>
    request<T>(url, { ...options, method: "GET" }),

  post: <T = any>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  del: <T = any>(url: string, options?: RequestInit) =>
    request<T>(url, { ...options, method: "DELETE" }),
};
