const apiBase = import.meta.env.VITE_API_URL || "";
const apiWakeRetryDelays = [1_000, 2_000, 4_000, 8_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000];

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

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

export async function waitForApiReady() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await apiRequest("/api/health");
      return;
    } catch (error) {
      const canRetry = !error.status || [500, 502, 503, 504].includes(error.status);
      if (!canRetry || attempt >= apiWakeRetryDelays.length) throw error;
      await wait(apiWakeRetryDelays[attempt]);
    }
  }
}
