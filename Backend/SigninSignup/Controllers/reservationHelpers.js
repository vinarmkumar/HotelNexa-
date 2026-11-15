const Reservation = require("../Models/Reservation");
const User = require("../Models/User");
const {
  sendReservationCancellationEmail,
  sendReservationConfirmationEmail,
} = require("../Middleware/Email");
const { getReservationPaymentAmounts } = require("../Services/hotelPricing");
const { getFreeCancellationEligibility } = require("../Services/reservationValidation");

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function isDuplicateKey(error) {
  return error?.code === 11000 || error?.writeErrors?.some((entry) => entry.code === 11000);
}

function publicReservation(reservation) {
  const checkIn = reservation.checkIn.toISOString().slice(0, 10);
  const cancellation = getFreeCancellationEligibility(checkIn);
  const { totalAmount, amountDueNow, amountPaid, balanceDue } = getReservationPaymentAmounts(reservation);
  return {
    id: String(reservation._id),
    hotelId: reservation.hotelId,
    roomId: reservation.roomId ? String(reservation.roomId) : "",
    roomTypeId: reservation.roomTypeId ? String(reservation.roomTypeId) : "",
    bedCount: reservation.bedCount,
    adults: reservation.adults,
    childAges: reservation.childAges,
    checkIn,
    checkOut: reservation.checkOut.toISOString().slice(0, 10),
    nights: reservation.nights,
    nightlyRate: reservation.nightlyRate,
    amount: totalAmount,
    totalAmount,
    paymentType: reservation.paymentType || "Full",
    amountDueNow,
    amountPaid,
    balanceDue,
    balancePaid: Math.max(0, amountPaid - amountDueNow),
    priceBreakdown: {
      nightlyRate: reservation.nightlyRate,
      nights: reservation.nights,
      subtotal: reservation.nightlyRate * reservation.nights,
      taxes: 0,
      total: totalAmount,
    },
    currency: reservation.currency,
    paymentStatus: reservation.paymentStatus,
    status: reservation.status,
    transactionId: reservation.transactionId,
    refundId: reservation.refundId,
    refundStatus: reservation.refundStatus,
    balanceTransactionId: reservation.balanceTransactionId || "",
    balancePaymentInProgress: Boolean(reservation.balanceOrderId && balanceDue > 0),
    refundedAt: reservation.refundedAt,
    cancellationRequestedAt: reservation.cancellationRequestedAt,
    cancelledAt: reservation.cancelledAt,
    cancellationInitiatedBy: reservation.cancellationInitiatedBy || "",
    cancellationActorName: reservation.cancellationActorName || "",
    cancellationReason: reservation.cancellationReason || "",
    freeCancellationUntil: cancellation.freeCancellationUntil,
    canCancelFree: reservation.status === "Confirmed"
      && reservation.paymentStatus === "Success"
      && !reservation.refundId
      && cancellation.allowed,
    confirmationEmailSent: Boolean(reservation.confirmationEmailSentAt),
    cancellationEmailSent: Boolean(reservation.cancellationEmailSentAt),
    holdExpiresAt: reservation.holdExpiresAt,
    createdAt: reservation.createdAt,
  };
}

async function saveBalancePayment(reservation, orderId, payment) {
  const { totalAmount, balanceDue } = getReservationPaymentAmounts(reservation);
  if (payment.order_id !== orderId || payment.amount !== balanceDue * 100
    || payment.currency !== "INR" || payment.status !== "captured") {
    return null;
  }

  const updated = await Reservation.findOneAndUpdate({
    _id: reservation._id,
    userId: reservation.userId,
    status: "Confirmed",
    paymentStatus: "Success",
    balanceOrderId: orderId,
    balanceDue,
  }, {
    $set: {
      amountPaid: totalAmount,
      balanceDue: 0,
      balanceTransactionId: payment.id,
      balanceOrderId: "",
    },
  }, { new: true });
  if (updated) return updated;

  return Reservation.findOne({
    _id: reservation._id,
    userId: reservation.userId,
    balanceTransactionId: payment.id,
    balanceDue: 0,
  });
}

async function sendBookingConfirmation(reservationId, { force = false } = {}) {
  const claimedAt = new Date();
  const claimStaleBefore = new Date(claimedAt.getTime() - 5 * 60_000);
  const resendAllowedBefore = new Date(claimedAt.getTime() - 60_000);
  const sendEligibility = force
    ? {
      $or: [
        { confirmationEmailSentAt: null },
        { confirmationEmailSentAt: { $lte: resendAllowedBefore } },
      ],
    }
    : { confirmationEmailSentAt: null };
  const reservation = await Reservation.findOneAndUpdate({
    _id: reservationId,
    status: "Confirmed",
    paymentStatus: "Success",
    $and: [
      sendEligibility,
      {
        $or: [
          { confirmationEmailClaimedAt: null },
          { confirmationEmailClaimedAt: { $lte: claimStaleBefore } },
        ],
      },
    ],
  }, {
    $set: { confirmationEmailClaimedAt: claimedAt },
  }, { new: true });

  if (!reservation) {
    const current = await Reservation.findById(reservationId)
      .select("confirmationEmailSentAt confirmationEmailClaimedAt").lean();
    if (current?.confirmationEmailClaimedAt
      && current.confirmationEmailClaimedAt > claimStaleBefore) {
      return "pending";
    }
    if (force && current?.confirmationEmailSentAt
      && current.confirmationEmailSentAt > resendAllowedBefore) {
      return "cooldown";
    }
    return current?.confirmationEmailSentAt ? "sent" : "pending";
  }

  try {
    const user = await User.findById(reservation.userId).select("name email").lean();
    if (!user?.email) throw new Error("Reservation guest email is unavailable.");
    await sendReservationConfirmationEmail(user.email, user.name, reservation);
    const result = await Reservation.updateOne({
      _id: reservation._id,
      confirmationEmailClaimedAt: claimedAt,
    }, {
      $set: { confirmationEmailSentAt: new Date() },
      $unset: { confirmationEmailClaimedAt: 1, confirmationEmailLastError: 1 },
    });
    return result.modifiedCount === 1 ? "sent" : "pending";
  } catch (error) {
    await Reservation.updateOne({
      _id: reservation._id,
      confirmationEmailClaimedAt: claimedAt,
    }, {
      $set: { confirmationEmailLastError: error.message.slice(0, 240) },
      $unset: { confirmationEmailClaimedAt: 1 },
    });
    console.error("Reservation confirmation email delivery failed:", error.message);
    return "pending";
  }
}

async function sendCancellationConfirmation(reservationId, initiatedByHotel = false) {
  const claimedAt = new Date();
  const claimStaleBefore = new Date(claimedAt.getTime() - 5 * 60_000);
  const reservation = await Reservation.findOneAndUpdate({
    _id: reservationId,
    status: { $in: ["CancellationPending", "Cancelled"] },
    refundStatus: { $in: ["Pending", "Processed"] },
    cancellationEmailSentAt: null,
    $or: [
      { cancellationEmailClaimedAt: null },
      { cancellationEmailClaimedAt: { $lte: claimStaleBefore } },
    ],
  }, {
    $set: {
      cancellationEmailClaimedAt: claimedAt,
      ...(initiatedByHotel ? { cancellationInitiatedBy: "hotelAdmin" } : {}),
    },
  }, { new: true });

  if (!reservation) {
    const current = await Reservation.findById(reservationId)
      .select("cancellationEmailSentAt").lean();
    return current?.cancellationEmailSentAt ? "sent" : "pending";
  }

  try {
    const user = await User.findById(reservation.userId).select("name email").lean();
    if (!user?.email) throw new Error("Reservation guest email is unavailable.");
    await sendReservationCancellationEmail(user.email, user.name, reservation);
    const result = await Reservation.updateOne({
      _id: reservation._id,
      cancellationEmailClaimedAt: claimedAt,
    }, {
      $set: { cancellationEmailSentAt: new Date() },
      $unset: { cancellationEmailClaimedAt: 1, cancellationEmailLastError: 1 },
    });
    return result.modifiedCount === 1 ? "sent" : "pending";
  } catch (error) {
    await Reservation.updateOne({
      _id: reservation._id,
      cancellationEmailClaimedAt: claimedAt,
    }, {
      $set: { cancellationEmailLastError: error.message.slice(0, 240) },
      $unset: { cancellationEmailClaimedAt: 1 },
    });
    console.error("Reservation cancellation email delivery failed:", error.message);
    return "pending";
  }
}

module.exports = {
  isDuplicateKey,
  publicReservation,
  saveBalancePayment,
  sendBookingConfirmation,
  sendCancellationConfirmation,
  sendError,
};
