"use client";

/**
 * Centralized API client wrapper for Next.js dashboard.
 * - Handles JSON serialization/deserialization.
 * - Automatically passes `credentials: 'include'` for Better Auth cookies.
 * - Intercepts 401 Unauthorized responses and redirects to `/login`.
 */

export interface ApiResponse<T = unknown> {
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
    let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
    if (typeof data === "object" && data !== null) {
      const errObj = data as Record<string, unknown>;
      const nested = errObj.error as Record<string, unknown> | string | undefined;
      if (typeof nested === "string") {
        errorMsg = nested;
      } else if (nested && typeof nested === "object" && typeof nested.message === "string") {
        errorMsg = nested.message;
      } else if (typeof errObj.message === "string") {
        errorMsg = errObj.message;
      }
    }
    throw new Error(errorMsg);
  }

  return data as T;
}

export const apiClient = {
  get: <T = unknown>(url: string, options?: RequestInit) =>
    request<T>(url, { ...options, method: "GET" }),

  post: <T = unknown>(url: string, body?: unknown, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T = unknown>(url: string, body?: unknown, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T = unknown>(url: string, body?: unknown, options?: RequestInit) =>
    request<T>(url, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  del: <T = unknown>(url: string, options?: RequestInit) =>
    request<T>(url, { ...options, method: "DELETE" }),
};
