import { apiRequest } from "../api.js";

export function interpretConciergeMessage(message) {
  return apiRequest("/api/ai/concierge/interpret", {
    method: "POST",
    body: { message },
  });
}

export function searchConciergeHotels(criteria) {
  return apiRequest("/api/ai/concierge/search", {
    method: "POST",
    body: criteria,
  });
}
