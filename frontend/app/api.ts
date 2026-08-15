export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${apiUrl}${path}`, { credentials: "include", ...init });
}
