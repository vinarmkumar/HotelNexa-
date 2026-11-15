const crypto = require("node:crypto");

const RAZORPAY_API = "https://api.razorpay.com/v1";
const REFUND_STATUS_POLL_ATTEMPTS = 10;
const REFUND_STATUS_POLL_INTERVAL_MS = 2_000;

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const paymentMode = process.env.PAYMENT_MODE || "test";
  if (paymentMode !== "test" || !keyId || !keyId.startsWith("rzp_test_") || !keySecret) {
    const error = new Error("Razorpay test mode is not configured. Set a test key ID and secret on the server.");
    error.status = 503;
    throw error;
  }
  return { keyId, keySecret };
}

async function razorpayRequest(path, { method = "GET", body } = {}) {
  const { keyId, keySecret } = getCredentials();
  let response;
  try {
    response = await fetch(`${RAZORPAY_API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    const requestError = new Error("Could not reach the Razorpay test gateway.");
    requestError.status = 502;
    requestError.cause = error;
    throw requestError;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const gatewayError = new Error("Razorpay test checkout could not complete the request.");
    gatewayError.status = response.status === 401 ? 503 : 502;
    throw gatewayError;
  }
  return data;
}

function createRazorpayOrder({ amountPaise, receipt, notes }) {
  return razorpayRequest("/orders", {
    method: "POST",
    body: {
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes,
    },
  });
}

function fetchRazorpayPayment(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

function fetchRazorpayPaymentRefunds(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refunds`);
}

async function waitForRazorpayRefundStatus(paymentId, refund) {
  for (let attempt = 0; attempt < REFUND_STATUS_POLL_ATTEMPTS && refund.status === "pending"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, REFUND_STATUS_POLL_INTERVAL_MS));
    const response = await fetchRazorpayPaymentRefunds(paymentId);
    const updatedRefund = (Array.isArray(response.items) ? response.items : [])
      .find((entry) => entry.id === refund.id);
    if (updatedRefund) refund = updatedRefund;
  }
  return refund;
}

function fetchRazorpayOrderPayments(orderId) {
  return razorpayRequest(`/orders/${encodeURIComponent(orderId)}/payments`);
}

function captureRazorpayPayment(paymentId, amountPaise) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    body: { amount: amountPaise, currency: "INR" },
  });
}

function refundRazorpayPayment(paymentId, amountPaise, notes) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: { amount: amountPaise, notes },
  });
}

function verifyPaymentSignature(orderId, paymentId, signature) {
  const { keySecret } = getCredentials();
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  captureRazorpayPayment,
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  fetchRazorpayPaymentRefunds,
  getCredentials,
  refundRazorpayPayment,
  verifyPaymentSignature,
  waitForRazorpayRefundStatus,
};
