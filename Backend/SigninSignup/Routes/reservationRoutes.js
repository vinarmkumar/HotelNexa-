const express = require("express");
const {
  cancelPendingReservation,
  cancelConfirmedBooking,
  cancelHotelBooking,
  createOrder,
  createBalancePaymentOrder,
  getMyReservations,
  getReports,
  releaseBalancePaymentOrder,
  reconcilePayment,
  resendConfirmationEmail,
  verifyBalancePayment,
  verifyPayment,
} = require("../Controllers/reservationController");
const { authenticate, requireHotelAdmin, requireStaffOrAdmin } = require("../Controllers/signinController");
const { getHotelOverview } = require("../Controllers/hotelAdminController");
const {
  createRoom,
  createRoomType,
  getAvailabilityQuote,
  getHotelInventory,
  updateRoom,
  updateReservationStayStatus,
  updateRoomType,
} = require("../Controllers/roomInventoryController");

const router = express.Router();

router.get("/availability", getAvailabilityQuote);
router.post("/orders", authenticate, createOrder);
router.get("/mine", authenticate, getMyReservations);
router.get("/admin/reports", authenticate, requireStaffOrAdmin, getReports);
router.get("/hotel-admin/overview", authenticate, requireHotelAdmin, getHotelOverview);
router.get("/hotel-admin/rooms", authenticate, requireHotelAdmin, getHotelInventory);
router.post("/hotel-admin/room-types", authenticate, requireHotelAdmin, createRoomType);
router.patch("/hotel-admin/room-types/:roomTypeId", authenticate, requireHotelAdmin, updateRoomType);
router.post("/hotel-admin/room-types/:roomTypeId/rooms", authenticate, requireHotelAdmin, createRoom);
router.patch("/hotel-admin/rooms/:roomId", authenticate, requireHotelAdmin, updateRoom);
router.post("/hotel-admin/:reservationId/stay-status", authenticate, requireHotelAdmin, updateReservationStayStatus);
router.post("/hotel-admin/:reservationId/cancel-booking", authenticate, requireHotelAdmin, cancelHotelBooking);
router.post("/:reservationId/reconcile-payment", authenticate, reconcilePayment);
router.post("/:reservationId/confirmation-email", authenticate, resendConfirmationEmail);
router.post("/:reservationId/balance-order", authenticate, createBalancePaymentOrder);
router.post("/:reservationId/balance-order/release", authenticate, releaseBalancePaymentOrder);
router.post("/:reservationId/verify-balance-payment", authenticate, verifyBalancePayment);
router.post("/:reservationId/cancel-booking", authenticate, cancelConfirmedBooking);
router.post("/:reservationId/verify-payment", authenticate, verifyPayment);
router.post("/:reservationId/cancel", authenticate, cancelPendingReservation);

module.exports = router;
