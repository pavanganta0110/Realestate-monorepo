const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    const rawMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      (typeof error.message === "string" || Array.isArray(error.message))
        ? error.message
        : null;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join("; ")
      : rawMessage || "API request failed";
    throw new Error(message);
  }

  const responseText = await response.text();
  if (!responseText.trim()) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error("API returned an invalid response");
  }
}

export const api = {
  get: (endpoint: string) => apiFetch(endpoint, { method: "GET" }),
  post: (endpoint: string, body: unknown) =>
    apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) }),
  patch: (endpoint: string, body: unknown) =>
    apiFetch(endpoint, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (endpoint: string, body?: unknown) =>
    apiFetch(endpoint, {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};
