import { apiRequest } from "../api.js";

let checkoutScriptPromise;

export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScriptPromise = null;
      reject(new Error("Razorpay test checkout could not be loaded. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return checkoutScriptPromise;
}

export function createReservationOrder(details) {
  return apiRequest("/api/reservations/orders", { method: "POST", body: details });
}

export function getMyReservations() {
  return apiRequest("/api/reservations/mine");
}

export function verifyReservationPayment(reservationId, details) {
  return apiRequest(`/api/reservations/${encodeURIComponent(reservationId)}/verify-payment`, {
    method: "POST",
    body: details,
  });
}

export function createReservationBalanceOrder(reservationId) {
  return apiRequest(`/api/reservations/${encodeURIComponent(reservationId)}/balance-order`, {
    method: "POST",
    body: {},
  });
}

export function verifyReservationBalancePayment(reservationId, details) {
  return apiRequest(`/api/reservations/${encodeURIComponent(reservationId)}/verify-balance-payment`, {
    method: "POST",
    body: details,
  });
}

export function releaseReservationBalanceOrder(reservationId, orderId) {
  return apiRequest(`/api/reservations/${encodeURIComponent(reservationId)}/balance-order/release`, {
    method: "POST",
    body: { orderId },
  });
}

export function reconcileReservationPayment(reservationId) {
  return apiRequest(`/api/reservations/${encodeURIComponent(reservationId)}/reconcile-payment`, {
    method: "POST",
    body: {},
  });
}

export function resendReservationConfirmationEmail(reservationId) {
  return apiRequest(`/api/reservations/${encodeURIComponent(reservationId)}/confirmation-email`, {
    method: "POST",
    body: {},
  });
}

export function cancelPendingReservation(reservationId) {
  return apiRequest(`/api/reservations/${encodeURIComponent(reservationId)}/cancel`, {
    method: "POST",
    body: {},
  });
}

export function cancelConfirmedBooking(reservationId) {
  return apiRequest(`/api/reservations/${encodeURIComponent(reservationId)}/cancel-booking`, {
    method: "POST",
    body: {},
  });
}
