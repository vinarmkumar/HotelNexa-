const apiBase = import.meta.env.VITE_API_URL || "";

export async function apiRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  if (!data) throw new Error("The server returned an unreadable response.");
  return data;
}
