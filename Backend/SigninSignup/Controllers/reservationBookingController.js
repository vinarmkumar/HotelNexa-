const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Reservation = require("../Models/Reservation");
const ReservationNight = require("../Models/ReservationNight");
const RoomType = require("../Models/RoomType");
const { findAvailableRoom } = require("../Services/roomInventoryService");
const { getReservationPaymentAmounts, hotelIds } = require("../Services/hotelPricing");
const {
  captureRazorpayPayment,
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  getCredentials,
  verifyPaymentSignature,
} = require("../Services/razorpayService");
const {
  getFreeCancellationEligibility,
  getStayDates,
  validateReservationInput,
} = require("../Services/reservationValidation");
const { isDuplicateKey, publicReservation, sendBookingConfirmation, sendError } = require("./reservationHelpers");

const HOLD_MINUTES = 30;

exports.createOrder = async (req, res) => {
  try {
    getCredentials();
    const validation = validateReservationInput(req.body);
    if (validation.error) return sendError(res, 400, validation.error);

    const {
      hotelId,
      checkIn,
      checkOut,
      adults,
      childAges,
      bedCount,
      roomTypeId,
      paymentType = "Full",
    } = req.body;
    if (!mongoose.isValidObjectId(roomTypeId)) {
      return sendError(res, 400, "Choose an available room type.");
    }
    if (!hotelIds.has(hotelId)) return sendError(res, 404, "The selected hotel is not available for booking.");
    if (!["Full", "Advance"].includes(paymentType)) {
      return sendError(res, 400, "Choose full payment or advance payment.");
    }
    const roomType = await RoomType.findOne({
      _id: roomTypeId,
      hotelId,
      bedCount,
      capacity: { $gte: adults + childAges.length },
      isActive: true,
    }).lean();
    if (!roomType) return sendError(res, 409, "The selected room type is no longer available for these guests.");
    const nightlyRate = roomType.nightlyRate;
    const totalAmount = nightlyRate * validation.nights;
    const amountDueNow = paymentType === "Advance"
      ? Math.min(roomType.advanceAmount, totalAmount)
      : totalAmount;
    const amountPaise = amountDueNow * 100;
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
    const receipt = `hn_${crypto.randomUUID().replaceAll("-", "").slice(0, 32)}`;
    const order = await createRazorpayOrder({
      amountPaise,
      receipt,
      notes: { hotelId, guestId: String(req.user._id) },
    });

    if (!order?.id || order.amount !== amountPaise || order.currency !== "INR") {
      console.error("Razorpay returned an order with unexpected amount or currency.");
      return sendError(res, 502, "The test checkout order could not be verified.");
    }

    const session = await mongoose.startSession();
    let reservation;
    try {
      await session.withTransaction(async () => {
        const stayDates = getStayDates(checkIn, validation.nights);
        const available = await findAvailableRoom({
          hotelId,
          bedCount,
          guestCount: adults + childAges.length,
          stayDates,
          session,
          removeExpiredLocks: true,
          roomTypeId,
        });
        if (available.roomType.nightlyRate !== nightlyRate
          || available.roomType.advanceAmount !== roomType.advanceAmount) {
          const error = new Error("The room price changed. Refresh the stay estimate before paying.");
          error.status = 409;
          throw error;
        }
        const { room } = available;
        const roomKeys = stayDates.map((date) =>
          `${room._id}|${date.toISOString().slice(0, 10)}`);

        [reservation] = await Reservation.create([{
          userId: req.user._id,
          hotelId,
          roomId: room._id,
          roomTypeId: roomType._id,
          bedCount,
          adults,
          childAges,
          checkIn: new Date(`${checkIn}T00:00:00.000Z`),
          checkOut: new Date(`${checkOut}T00:00:00.000Z`),
          nights: validation.nights,
          nightlyRate,
          amount: totalAmount,
          paymentType,
          amountDueNow,
          amountPaid: 0,
          balanceDue: totalAmount - amountDueNow,
          orderId: order.id,
          holdExpiresAt,
        }], { session });

        await ReservationNight.insertMany(stayDates.map((stayDate, index) => ({
          reservationId: reservation._id,
          hotelId,
          roomId: room._id,
          bedCount,
          stayDate,
          roomKey: roomKeys[index],
          expiresAt: holdExpiresAt,
        })), { session, ordered: true });
      });
    } finally {
      await session.endSession();
    }

    return res.status(201).json({
      success: true,
      reservation: publicReservation(reservation),
      checkout: {
        key: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: amountPaise,
        currency: "INR",
        expiresAt: holdExpiresAt.toISOString(),
        paymentType,
        totalAmount,
        amountDueNow,
        balanceDue: totalAmount - amountDueNow,
        priceBreakdown: {
          nightlyRate,
          nights: validation.nights,
          subtotal: totalAmount,
          taxes: 0,
          total: totalAmount,
          dueNow: amountDueNow,
          balanceDue: totalAmount - amountDueNow,
        },
        prefill: { name: req.user.name, email: req.user.email },
      },
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return sendError(res, 409, "This room is no longer available for one or more selected dates. Choose another stay or dates.");
    }
    if (error.status) return sendError(res, error.status, error.message);
    console.error("Reservation order creation failed:", error.message);
    return sendError(res, 500, "The reservation checkout could not be started.");
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { orderId, paymentId, signature } = req.body || {};
    if (!mongoose.isValidObjectId(reservationId)
      || typeof orderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(orderId)
      || typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
      return sendError(res, 400, "The payment verification details are invalid.");
    }

    const reservation = await Reservation.findOne({ _id: reservationId, userId: req.user._id });
    if (!reservation) return sendError(res, 404, "The reservation could not be found.");
    const { totalAmount, amountDueNow } = getReservationPaymentAmounts(reservation);
    if (reservation.status === "Confirmed" && reservation.transactionId === paymentId) {
      await sendBookingConfirmation(reservation._id);
      const current = await Reservation.findById(reservation._id);
      return res.json({ success: true, reservation: publicReservation(current) });
    }
    if (reservation.orderId !== orderId) {
      return sendError(res, 409, "This reservation is no longer awaiting payment.");
    }
    if (reservation.status === "Cancelled" && reservation.paymentStatus === "Failed") {
      return exports.reconcilePayment(req, res);
    }
    if (reservation.status !== "PaymentPending") {
      return sendError(res, 409, "This reservation is no longer awaiting payment.");
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
      return sendError(res, 400, "Razorpay could not verify this test payment.");
    }

    let payment = await fetchRazorpayPayment(paymentId);
    if (payment.order_id !== orderId || payment.amount !== amountDueNow * 100 || payment.currency !== "INR") {
      return sendError(res, 400, "The payment amount or order does not match this reservation.");
    }
    if (payment.status === "authorized") {
      payment = await captureRazorpayPayment(paymentId, amountDueNow * 100);
    }
    if (payment.status !== "captured" || payment.order_id !== orderId
      || payment.amount !== amountDueNow * 100 || payment.currency !== "INR") {
      return sendError(res, 409, "The test payment has not been captured. Complete checkout before verifying.");
    }

    const session = await mongoose.startSession();
    let confirmedReservation;
    try {
      await session.withTransaction(async () => {
        const current = await Reservation.findOne({
          _id: reservationId,
          userId: req.user._id,
          status: "PaymentPending",
          paymentStatus: "Pending",
          orderId,
        }).session(session);
        if (!current) {
          const alreadyConfirmed = await Reservation.findOne({
            _id: reservationId,
            userId: req.user._id,
            status: "Confirmed",
            paymentStatus: "Success",
            transactionId: paymentId,
          }).session(session);
          if (alreadyConfirmed) {
            confirmedReservation = alreadyConfirmed;
            return;
          }
        }
        if (!current || current.holdExpiresAt <= new Date()) {
          const error = new Error("The room hold expired before payment verification.");
          error.status = 410;
          throw error;
        }

        const activeLocks = await ReservationNight.countDocuments({
          reservationId: current._id,
          expiresAt: { $gt: new Date() },
        }).session(session);
        if (activeLocks !== current.nights) {
          const error = new Error("The room hold is no longer valid. Contact support to review this test payment.");
          error.status = 410;
          throw error;
        }

        confirmedReservation = await Reservation.findOneAndUpdate({
          _id: current._id,
          userId: req.user._id,
          status: "PaymentPending",
          paymentStatus: "Pending",
        }, {
          $set: {
            status: "Confirmed",
            paymentStatus: "Success",
            transactionId: paymentId,
            paymentVerifiedAt: new Date(),
            amountPaid: amountDueNow,
            balanceDue: totalAmount - amountDueNow,
          },
        }, { new: true, session });

        if (!confirmedReservation) {
          const error = new Error("This reservation was already updated.");
          error.status = 409;
          throw error;
        }

        await ReservationNight.updateMany(
          { reservationId: current._id },
          { $unset: { expiresAt: 1 } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    await sendBookingConfirmation(confirmedReservation._id);
    const currentReservation = await Reservation.findById(confirmedReservation._id);
    return res.json({ success: true, reservation: publicReservation(currentReservation) });
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.message);
    console.error("Payment verification failed:", error.message);
    return sendError(res, 500, "The test payment could not be verified. Your room hold remains pending.");
  }
};

exports.reconcilePayment = async (req, res) => {
  try {
    const { reservationId } = req.params;
    if (!mongoose.isValidObjectId(reservationId)) {
      return sendError(res, 400, "The reservation ID is invalid.");
    }

    const reservation = await Reservation.findOne({ _id: reservationId, userId: req.user._id });
    if (!reservation) return sendError(res, 404, "The reservation could not be found.");
    const { totalAmount, amountDueNow } = getReservationPaymentAmounts(reservation);
    if (reservation.status === "Confirmed" && reservation.paymentStatus === "Success") {
      await sendBookingConfirmation(reservation._id);
      const current = await Reservation.findById(reservation._id);
      return res.json({ success: true, reservation: publicReservation(current) });
    }
    if (reservation.refundId) {
      return res.json({
        success: true,
        refunded: true,
        message: "The test payment was refunded because the room could not be confirmed.",
        reservation: publicReservation(reservation),
      });
    }
    if (!["PaymentPending", "Cancelled"].includes(reservation.status)) {
      return sendError(res, 409, "This reservation cannot be reconciled.");
    }

    const orderPayments = await fetchRazorpayOrderPayments(reservation.orderId);
    const capturedPayments = (Array.isArray(orderPayments.items) ? orderPayments.items : [])
      .filter((payment) => payment.status === "captured"
        && payment.captured === true
        && payment.order_id === reservation.orderId
        && payment.amount === amountDueNow * 100
        && payment.currency === "INR");
    if (capturedPayments.length === 0) {
      return sendError(res, 409, "No captured test payment was found for this reservation.");
    }
    if (capturedPayments.length > 1) {
      console.error("Multiple captured payments found for one reservation order.");
      return sendError(res, 409, "Multiple captured test payments need manual review. Contact support before trying another payment.");
    }

    const payment = capturedPayments[0];
    const session = await mongoose.startSession();
    let confirmedReservation;
    try {
      await session.withTransaction(async () => {
        const current = await Reservation.findOne({
          _id: reservationId,
          userId: req.user._id,
          status: { $in: ["PaymentPending", "Cancelled"] },
        }).session(session);
        if (!current) {
          confirmedReservation = await Reservation.findOne({
            _id: reservationId,
            userId: req.user._id,
            status: "Confirmed",
            paymentStatus: "Success",
            transactionId: payment.id,
          }).session(session);
          if (confirmedReservation) return;
          const error = new Error("This reservation has already been updated.");
          error.status = 409;
          throw error;
        }

        const stayDates = getStayDates(current.checkIn.toISOString().slice(0, 10), current.nights);
        await ReservationNight.deleteMany({ reservationId: current._id }).session(session);
        const available = await findAvailableRoom({
          hotelId: current.hotelId,
          bedCount: current.bedCount,
          guestCount: current.adults + current.childAges.length,
          stayDates,
          session,
          removeExpiredLocks: true,
          ...(current.roomTypeId ? { roomTypeId: current.roomTypeId } : {}),
        });
        const { room, roomType } = available;
        const roomKeys = stayDates.map((date) =>
          `${room._id}|${date.toISOString().slice(0, 10)}`);
        await ReservationNight.insertMany(stayDates.map((stayDate, index) => ({
          reservationId: current._id,
          hotelId: current.hotelId,
          roomId: room._id,
          bedCount: current.bedCount,
          stayDate,
          roomKey: roomKeys[index],
        })), { session, ordered: true });

        confirmedReservation = await Reservation.findOneAndUpdate({
          _id: current._id,
          userId: req.user._id,
          status: { $in: ["PaymentPending", "Cancelled"] },
        }, {
          $set: {
            status: "Confirmed",
            paymentStatus: "Success",
            roomId: room._id,
            roomTypeId: roomType._id,
            transactionId: payment.id,
            paymentVerifiedAt: new Date(),
            amountPaid: amountDueNow,
            balanceDue: totalAmount - amountDueNow,
          },
        }, { new: true, session });
        if (!confirmedReservation) {
          const error = new Error("This reservation changed while the payment was being reconciled.");
          error.status = 409;
          throw error;
        }
      });
    } finally {
      await session.endSession();
    }

    await sendBookingConfirmation(confirmedReservation._id);
    const currentReservation = await Reservation.findById(confirmedReservation._id);
    return res.json({ success: true, reservation: publicReservation(currentReservation) });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return sendError(res, 409, "This test payment was captured, but another booking now holds the room. Contact support to arrange a test refund.");
    }
    if (error.status) return sendError(res, error.status, error.message);
    console.error("Captured payment reconciliation failed:", error.message);
    return sendError(res, 500, "The captured test payment could not be reconciled. Do not pay again; contact support.");
  }
};

exports.resendConfirmationEmail = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reservationId)) {
      return sendError(res, 400, "The reservation ID is invalid.");
    }
    const reservation = await Reservation.findOne({
      _id: req.params.reservationId,
      userId: req.user._id,
      status: "Confirmed",
      paymentStatus: "Success",
    });
    if (!reservation) return sendError(res, 404, "A confirmed reservation could not be found.");

    const emailStatus = await sendBookingConfirmation(reservation._id, { force: true });
    const current = await Reservation.findById(reservation._id);
    if (emailStatus === "cooldown") {
      return res.status(429).json({
        success: false,
        message: "A confirmation email was sent recently. Please wait a minute before requesting another.",
        reservation: publicReservation(current),
      });
    }
    if (emailStatus !== "sent") {
      return res.status(502).json({
        success: false,
        message: "The booking is confirmed, but its email could not be sent right now. Please try again later.",
        reservation: publicReservation(current),
      });
    }
    return res.json({ success: true, reservation: publicReservation(current) });
  } catch (error) {
    console.error("Reservation confirmation email retry failed:", error.message);
    return sendError(res, 500, "The booking confirmation email could not be retried.");
  }
};
