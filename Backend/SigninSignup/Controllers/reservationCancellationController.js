const mongoose = require("mongoose");
const Reservation = require("../Models/Reservation");
const ReservationNight = require("../Models/ReservationNight");
const { getReservationPaymentAmounts } = require("../Services/hotelPricing");
const {
  fetchRazorpayPayment,
  fetchRazorpayPaymentRefunds,
  refundRazorpayPayment,
  waitForRazorpayRefundStatus,
} = require("../Services/razorpayService");
const { getFreeCancellationEligibility } = require("../Services/reservationValidation");
const { publicReservation, sendCancellationConfirmation, sendError } = require("./reservationHelpers");

async function finalizeFreeCancellation(reservation) {
  const session = await mongoose.startSession();
  let cancelled;
  try {
    await session.withTransaction(async () => {
      cancelled = await Reservation.findOneAndUpdate({
        _id: reservation._id,
        userId: reservation.userId,
        status: "CancellationPending",
        refundId: reservation.refundId,
      }, {
        $set: {
          status: "Cancelled",
          refundStatus: "Processed",
          refundedAt: new Date(),
          cancelledAt: new Date(),
        },
        $unset: { refundClaimedAt: 1 },
      }, { new: true, session });
      if (!cancelled) {
        const error = new Error("The cancellation changed while the refund was being confirmed.");
        error.status = 409;
        throw error;
      }
      await ReservationNight.deleteMany({ reservationId: reservation._id }, { session });
    });
  } finally {
    await session.endSession();
  }
  return cancelled;
}

async function cancelReservation(req, res, initiatedByHotel = false) {
  try {
    const { reservationId } = req.params;
    if (!mongoose.isValidObjectId(reservationId)) {
      return sendError(res, 400, "The reservation ID is invalid.");
    }

    const ownerFilter = initiatedByHotel
      ? { hotelId: req.user.hotelId }
      : { userId: req.user._id };
    if (initiatedByHotel && (!req.user.hotelId || req.user.role !== "hotelAdmin")) {
      return sendError(res, 403, "Hotel administrator access is required.");
    }
    let reservation = await Reservation.findOne({ _id: reservationId, ...ownerFilter });
    if (!reservation) return sendError(res, 404, "The reservation could not be found.");
    const { amountPaid } = getReservationPaymentAmounts(reservation);
    if (reservation.status === "Cancelled" && reservation.refundStatus === "Processed") {
      const emailStatus = await sendCancellationConfirmation(reservation._id, initiatedByHotel);
      reservation = await Reservation.findById(reservation._id);
      return res.json({
        success: true,
        cancelled: true,
        message: emailStatus === "sent"
          ? "The booking is cancelled, the full amount paid has been refunded, and the cancellation email was accepted by the email provider."
          : "The booking is cancelled and the full amount paid has been refunded, but the cancellation email could not be sent yet. Please try again.",
        reservation: publicReservation(reservation),
      });
    }

    const now = new Date();
    const staleClaimBefore = new Date(now.getTime() - 2 * 60_000);
    if (reservation.status === "Confirmed") {
      if (reservation.balanceDue > 0 && reservation.balanceOrderId) {
        return sendError(res, 409, "Close the remaining-balance checkout before cancelling this booking.");
      }
      const cancellation = getFreeCancellationEligibility(reservation.checkIn.toISOString().slice(0, 10));
      if (!initiatedByHotel && !cancellation.allowed) {
        return sendError(res, 409, "Free cancellation is only available until one calendar day before check-in.");
      }
      if (reservation.paymentStatus !== "Success" || !reservation.transactionId || amountPaid <= 0) {
        return sendError(res, 409, "Only a confirmed, successfully paid booking can be cancelled.");
      }
      reservation = await Reservation.findOneAndUpdate({
        _id: reservation._id,
        ...ownerFilter,
        status: "Confirmed",
        paymentStatus: "Success",
        transactionId: reservation.transactionId,
        $or: [
          { balanceOrderId: "" },
          { balanceOrderId: { $exists: false } },
        ],
      }, {
        $set: {
          status: "CancellationPending",
          refundStatus: "Pending",
          cancellationRequestedAt: now,
          cancellationInitiatedBy: initiatedByHotel ? "hotelAdmin" : "guest",
          cancellationActorId: req.user._id,
          cancellationActorName: req.user.name,
          cancellationActorEmail: req.user.email,
          cancellationReason: initiatedByHotel ? "Cancelled by hotel administrator" : "Cancelled by guest",
          refundClaimedAt: now,
        },
      }, { new: true });
    } else if (reservation.status === "CancellationPending") {
      reservation = await Reservation.findOneAndUpdate({
        _id: reservation._id,
        ...ownerFilter,
        status: "CancellationPending",
        $or: [
          { refundClaimedAt: null },
          { refundClaimedAt: { $lte: staleClaimBefore } },
        ],
      }, {
        $set: { refundClaimedAt: now },
      }, { new: true });
    } else {
      return sendError(res, 409, "Only confirmed bookings can be cancelled.");
    }

    if (!reservation) {
      return sendError(res, 409, "A cancellation or refund check is already in progress. Please try again shortly.");
    }

    try {
      const payment = await fetchRazorpayPayment(reservation.transactionId);
      if (payment.order_id !== reservation.orderId
        || payment.amount !== amountPaid * 100
        || payment.currency !== "INR"
        || !["captured", "refunded"].includes(payment.status)) {
        const error = new Error("Razorpay payment details do not match this reservation.");
        error.status = 409;
        throw error;
      }

      const refundResponse = await fetchRazorpayPaymentRefunds(reservation.transactionId);
      const refunds = Array.isArray(refundResponse.items) ? refundResponse.items : [];
      let refund = refunds.find((entry) => entry.notes?.reservationId === String(reservation._id)
        && entry.amount === amountPaid * 100
        && entry.payment_id === reservation.transactionId
        && ["processed", "pending"].includes(entry.status));

      if (!refund) {
        if (Number(payment.amount_refunded || 0) > 0) {
          const error = new Error("A different refund already exists for this payment. Contact support to complete cancellation safely.");
          error.status = 409;
          throw error;
        }
        refund = await refundRazorpayPayment(
          reservation.transactionId,
          amountPaid * 100,
          {
            reservationId: String(reservation._id),
            reason: initiatedByHotel ? "Hotel administrator cancelled booking" : "Free cancellation before check-in",
          },
        );
      }

      if (!refund?.id
        || refund.payment_id !== reservation.transactionId
        || refund.amount !== amountPaid * 100) {
        const error = new Error("Razorpay did not confirm the full refund amount for this booking.");
        error.status = 502;
        throw error;
      }

      if (refund.status === "pending") {
        try {
          refund = await waitForRazorpayRefundStatus(reservation.transactionId, refund);
        } catch (error) {
          console.error("Razorpay refund status check failed:", error.message);
        }
      }
      if (refund.payment_id !== reservation.transactionId || refund.amount !== amountPaid * 100) {
        const error = new Error("Razorpay refund details changed while its status was being checked.");
        error.status = 409;
        throw error;
      }

      if (refund.status === "failed") {
        await Reservation.updateOne({
          _id: reservation._id,
          ...ownerFilter,
          status: "CancellationPending",
          refundClaimedAt: now,
        }, {
          $set: { status: "Confirmed", refundStatus: "Failed" },
          $unset: { cancellationRequestedAt: 1, refundClaimedAt: 1 },
        });
        return sendError(res, 502, "Razorpay could not complete the refund. Your booking is still confirmed; please try again.");
      }

      if (!["processed", "pending"].includes(refund.status)) {
        const error = new Error("Razorpay refund status is not final yet.");
        error.status = 502;
        throw error;
      }

      const refundStatus = refund.status === "processed" ? "Processed" : "Pending";
      const updated = await Reservation.findOneAndUpdate({
        _id: reservation._id,
        ...ownerFilter,
        status: "CancellationPending",
        refundClaimedAt: now,
      }, {
        $set: { refundId: refund.id, refundStatus },
        $unset: { refundClaimedAt: 1 },
      }, { new: true });
      if (!updated) {
        return sendError(res, 409, "The refund is processing. Refresh My Bookings to check its status.");
      }

      if (refund.status === "processed") {
        const cancelled = await finalizeFreeCancellation(updated);
        const emailStatus = await sendCancellationConfirmation(cancelled._id, initiatedByHotel);
        const current = await Reservation.findById(cancelled._id);
        return res.json({
          success: true,
          cancelled: true,
          message: emailStatus === "sent"
            ? "The booking is cancelled, the full amount paid has been refunded, and the cancellation email was accepted by the email provider."
            : "The booking is cancelled and the full amount paid has been refunded, but the cancellation email could not be sent yet. Please try again.",
          reservation: publicReservation(current),
        });
      }

      const emailStatus = await sendCancellationConfirmation(updated._id, initiatedByHotel);
      const current = await Reservation.findById(updated._id);
      return res.json({
        success: true,
        cancelled: true,
        message: emailStatus === "sent"
          ? "The booking is cancelled and the refund is processing. The cancellation email was accepted by the email provider."
          : "The booking is cancelled and the refund is processing, but the cancellation email could not be sent.",
        reservation: publicReservation(current),
      });
    } catch (error) {
      await Reservation.updateOne({
        _id: reservation._id,
        ...ownerFilter,
        status: "CancellationPending",
        refundClaimedAt: now,
      }, { $unset: { refundClaimedAt: 1 } });
      throw error;
    }
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.message);
    console.error("Confirmed booking cancellation failed:", error.message);
    return sendError(res, 502, "The refund status could not be checked. Your booking has not been cancelled; try again.");
  }
}

exports.cancelConfirmedBooking = (req, res) => cancelReservation(req, res);
exports.cancelHotelBooking = (req, res) => cancelReservation(req, res, true);

let pendingCancellationSweep;
let pendingCancellationSweepRunning = false;

exports.startPendingCancellationReconciliation = () => {
  if (pendingCancellationSweep) return pendingCancellationSweep;

  const reconcile = async () => {
    if (pendingCancellationSweepRunning) return;
    pendingCancellationSweepRunning = true;
    try {
      const reservations = await Reservation.find({
        status: "CancellationPending",
        refundStatus: "Pending",
      }).sort({ updatedAt: 1 }).limit(20).lean();

      for (const reservation of reservations) {
        const initiatedByHotel = reservation.cancellationInitiatedBy === "hotelAdmin";
        const response = {
          status(code) {
            this.statusCode = code;
            return this;
          },
          json(body) {
            this.body = body;
            return this;
          },
        };
        await cancelReservation({
          params: { reservationId: String(reservation._id) },
          user: {
            _id: initiatedByHotel ? reservation.cancellationActorId : reservation.userId,
            role: initiatedByHotel ? "hotelAdmin" : "guest",
            hotelId: initiatedByHotel ? reservation.hotelId : "",
            name: reservation.cancellationActorName,
            email: reservation.cancellationActorEmail,
          },
        }, response, initiatedByHotel);
      }
    } catch (error) {
      console.error("Pending cancellation reconciliation failed:", error.message);
    } finally {
      pendingCancellationSweepRunning = false;
    }
  };

  void reconcile();
  pendingCancellationSweep = setInterval(reconcile, 30_000);
  pendingCancellationSweep.unref();
  return pendingCancellationSweep;
};

exports.cancelPendingReservation = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reservationId)) {
      return sendError(res, 400, "The reservation ID is invalid.");
    }
    const session = await mongoose.startSession();
    let cancelled = false;
    try {
      await session.withTransaction(async () => {
        const reservation = await Reservation.findOneAndUpdate({
          _id: req.params.reservationId,
          userId: req.user._id,
          status: "PaymentPending",
          paymentStatus: "Pending",
        }, {
          $set: { status: "Cancelled", paymentStatus: "Failed" },
        }, { new: true, session });
        if (!reservation) return;
        await ReservationNight.deleteMany({ reservationId: reservation._id }, { session });
        cancelled = true;
      });
    } finally {
      await session.endSession();
    }
    return res.json({ success: true, cancelled });
  } catch (error) {
    console.error("Pending reservation cancellation failed:", error.message);
    return sendError(res, 500, "The pending reservation could not be released.");
  }
};
