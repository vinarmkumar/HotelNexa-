const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Reservation = require("../Models/Reservation");
const { getReservationPaymentAmounts } = require("../Services/hotelPricing");
const {
  captureRazorpayPayment,
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  getCredentials,
  verifyPaymentSignature,
} = require("../Services/razorpayService");
const { publicReservation, saveBalancePayment, sendError } = require("./reservationHelpers");

exports.createBalancePaymentOrder = async (req, res) => {
  try {
    getCredentials();
    const { reservationId } = req.params;
    if (!mongoose.isValidObjectId(reservationId)) {
      return sendError(res, 400, "The reservation ID is invalid.");
    }

    const reservation = await Reservation.findOne({
      _id: reservationId,
      userId: req.user._id,
    });
    if (!reservation) return sendError(res, 404, "The reservation could not be found.");
    if (reservation.status !== "Confirmed" || reservation.paymentStatus !== "Success") {
      return sendError(res, 409, "Only a confirmed reservation can pay its remaining balance.");
    }
    if (reservation.balanceDue <= 0) {
      return sendError(res, 409, "This reservation has no remaining balance.");
    }

    const amountPaise = reservation.balanceDue * 100;
    let orderId = reservation.balanceOrderId;
    if (orderId) {
      const paymentResponse = await fetchRazorpayOrderPayments(orderId);
      const existingPayment = (Array.isArray(paymentResponse.items) ? paymentResponse.items : [])
        .find((payment) => ["authorized", "captured"].includes(payment.status));
      if (existingPayment) {
        if (existingPayment.order_id !== orderId || existingPayment.amount !== amountPaise
          || existingPayment.currency !== "INR") {
          return sendError(res, 409, "An existing balance payment does not match the amount due. Contact support.");
        }
        let capturedPayment = existingPayment;
        if (capturedPayment.status === "authorized") {
          capturedPayment = await captureRazorpayPayment(capturedPayment.id, amountPaise);
        }
        const settled = await saveBalancePayment(reservation, orderId, capturedPayment);
        if (!settled) return sendError(res, 409, "The existing balance payment has not been captured.");
        return res.json({ success: true, paid: true, reservation: publicReservation(settled) });
      }
    }

    if (!orderId) {
      const order = await createRazorpayOrder({
        amountPaise,
        receipt: `hn_bal_${crypto.randomUUID().replaceAll("-", "").slice(0, 28)}`,
        notes: {
          reservationId: String(reservation._id),
          guestId: String(req.user._id),
          paymentPurpose: "remaining-balance",
        },
      });
      if (!order?.id || order.amount !== amountPaise || order.currency !== "INR") {
        console.error("Razorpay returned a balance order with unexpected amount or currency.");
        return sendError(res, 502, "The remaining-balance test checkout could not be verified.");
      }

      const updated = await Reservation.findOneAndUpdate({
        _id: reservation._id,
        userId: req.user._id,
        status: "Confirmed",
        paymentStatus: "Success",
        balanceDue: reservation.balanceDue,
        $or: [
          { balanceOrderId: "" },
          { balanceOrderId: { $exists: false } },
        ],
      }, {
        $set: { balanceOrderId: order.id },
      }, { new: true });

      if (!updated) {
        const latest = await Reservation.findOne({
          _id: reservation._id,
          userId: req.user._id,
          status: "Confirmed",
          paymentStatus: "Success",
        });
        if (!latest?.balanceOrderId || latest.balanceDue !== reservation.balanceDue) {
          return sendError(res, 409, "This reservation changed while the balance checkout was being prepared.");
        }
        orderId = latest.balanceOrderId;
      } else {
        orderId = updated.balanceOrderId;
      }
    }

    return res.status(orderId === reservation.balanceOrderId ? 200 : 201).json({
      success: true,
      checkout: {
        key: process.env.RAZORPAY_KEY_ID,
        orderId,
        amount: amountPaise,
        currency: "INR",
        balanceDue: reservation.balanceDue,
        prefill: { name: req.user.name, email: req.user.email },
      },
    });
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.message);
    console.error("Remaining-balance order creation failed:", error.message);
    return sendError(res, 500, "The remaining-balance checkout could not be started.");
  }
};

exports.releaseBalancePaymentOrder = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { orderId } = req.body || {};
    if (!mongoose.isValidObjectId(reservationId)
      || typeof orderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(orderId)) {
      return sendError(res, 400, "The balance checkout details are invalid.");
    }

    const reservation = await Reservation.findOne({
      _id: reservationId,
      userId: req.user._id,
    });
    if (!reservation) return sendError(res, 404, "The reservation could not be found.");
    if (reservation.balanceOrderId !== orderId || reservation.balanceDue <= 0) {
      return res.json({ success: true, released: false, reservation: publicReservation(reservation) });
    }

    const paymentResponse = await fetchRazorpayOrderPayments(orderId);
    const payments = Array.isArray(paymentResponse.items) ? paymentResponse.items : [];
    if (payments.some((payment) => ["authorized", "captured"].includes(payment.status))) {
      return sendError(res, 409, "A balance payment was already started. Complete payment verification before closing checkout.");
    }

    const released = await Reservation.findOneAndUpdate({
      _id: reservation._id,
      userId: req.user._id,
      status: "Confirmed",
      balanceDue: reservation.balanceDue,
      balanceOrderId: orderId,
    }, {
      $set: { balanceOrderId: "" },
    }, { new: true });
    if (!released) return sendError(res, 409, "The reservation changed while the balance checkout was closing.");
    return res.json({ success: true, released: true, reservation: publicReservation(released) });
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.message);
    console.error("Remaining-balance checkout release failed:", error.message);
    return sendError(res, 502, "The balance checkout could not be safely closed.");
  }
};

exports.verifyBalancePayment = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { orderId, paymentId, signature } = req.body || {};
    if (!mongoose.isValidObjectId(reservationId)
      || typeof orderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(orderId)
      || typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
      return sendError(res, 400, "The balance payment details are invalid.");
    }

    const reservation = await Reservation.findOne({
      _id: reservationId,
      userId: req.user._id,
    });
    if (!reservation) return sendError(res, 404, "The reservation could not be found.");
    if (reservation.balanceTransactionId === paymentId && reservation.balanceDue === 0) {
      return res.json({ success: true, reservation: publicReservation(reservation) });
    }
    if (reservation.status !== "Confirmed" || reservation.paymentStatus !== "Success"
      || reservation.balanceOrderId !== orderId || reservation.balanceDue <= 0) {
      return sendError(res, 409, "This balance payment no longer matches an active reservation.");
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
      return sendError(res, 400, "Razorpay could not verify this balance payment.");
    }

    const balanceDue = reservation.balanceDue;
    let payment = await fetchRazorpayPayment(paymentId);
    if (payment.order_id !== orderId || payment.amount !== balanceDue * 100 || payment.currency !== "INR") {
      return sendError(res, 400, "The balance payment amount or order does not match this reservation.");
    }
    if (payment.status === "authorized") {
      payment = await captureRazorpayPayment(paymentId, balanceDue * 100);
    }
    if (payment.status !== "captured" || payment.order_id !== orderId
      || payment.amount !== balanceDue * 100 || payment.currency !== "INR") {
      return sendError(res, 409, "The balance test payment has not been captured.");
    }

    const updated = await saveBalancePayment(reservation, orderId, payment);
    if (!updated) return sendError(res, 409, "The balance payment was captured, but the reservation could not be updated. Contact support.");

    return res.json({ success: true, reservation: publicReservation(updated) });
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.message);
    console.error("Remaining-balance payment verification failed:", error.message);
    return sendError(res, 500, "The remaining-balance payment could not be verified.");
  }
};
