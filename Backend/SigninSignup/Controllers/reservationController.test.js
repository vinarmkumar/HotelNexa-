const test = require("node:test");
const assert = require("node:assert/strict");
const Reservation = require("../Models/Reservation");
const controller = require("./reservationController");

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("reservation controller keeps the route handler exports stable", () => {
  assert.deepEqual(Object.keys(controller).sort(), [
    "cancelConfirmedBooking",
    "cancelHotelBooking",
    "cancelPendingReservation",
    "createBalancePaymentOrder",
    "createOrder",
    "getMyReservations",
    "getReports",
    "reconcilePayment",
    "releaseBalancePaymentOrder",
    "resendConfirmationEmail",
    "startPendingCancellationReconciliation",
    "verifyBalancePayment",
    "verifyPayment",
  ]);
});

test("invalid report dates return the same predictable client error", async () => {
  const response = createResponse();
  await controller.getReports({ query: { from: "not-a-date" } }, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    message: "Report dates must use YYYY-MM-DD.",
  });
});

test("booking history is scoped to the signed-in guest", async () => {
  const originalFind = Reservation.find;
  const guestId = "guest-123";
  let receivedFilter;
  Reservation.find = (filter) => {
    receivedFilter = filter;
    return {
      sort() { return this; },
      limit() { return this; },
      lean: async () => [],
    };
  };

  try {
    const response = createResponse();
    await controller.getMyReservations({ user: { _id: guestId } }, response);
    assert.deepEqual(receivedFilter, { userId: guestId });
    assert.deepEqual(response.body, { success: true, reservations: [] });
  } finally {
    Reservation.find = originalFind;
  }
});
