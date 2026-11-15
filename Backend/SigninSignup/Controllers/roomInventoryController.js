const mongoose = require("mongoose");
const AuditLog = require("../Models/AuditLog");
const Room = require("../Models/Room");
const RoomType = require("../Models/RoomType");
const ReservationNight = require("../Models/ReservationNight");
const { hotelIds } = require("../Services/hotelPricing");
const { getStayDates, getTodayInIndia, validateReservationInput } = require("../Services/reservationValidation");
const { findAvailableRoom, releaseReservationRoomNights } = require("../Services/roomInventoryService");
const Reservation = require("../Models/Reservation");

const allowedAmenities = new Set([
  "Wi-Fi",
  "Breakfast",
  "Air conditioning",
  "Heating",
  "Television",
  "Refrigerator",
  "Private bathroom",
  "Balcony",
  "Workspace",
  "Parking",
  "Restaurant",
  "Pool",
]);

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function hotelIdForAdmin(req, res) {
  if (!req.user.hotelId || !hotelIds.has(req.user.hotelId)) {
    sendError(res, 403, "This account is not assigned to a hotel in the directory.");
    return null;
  }
  return req.user.hotelId;
}

function normalizeRoomTypeInput(body, { creating = false } = {}) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const bedCount = Number(body.bedCount);
  const capacity = Number(body.capacity);
  const nightlyRate = Number(body.nightlyRate);
  const advanceAmount = Number(body.advanceAmount);
  const amenities = body.amenities === undefined
    ? undefined
    : Array.isArray(body.amenities) ? [...new Set(body.amenities)] : null;
  const isActive = body.isActive;
  if ((creating || body.name !== undefined) && (!name || name.length > 80)
    || (creating && (!Number.isInteger(bedCount) || bedCount < 1 || bedCount > 4))
    || (creating && (!Number.isInteger(capacity) || capacity < bedCount || capacity > 20))
    || (body.capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1 || capacity > 20))
    || (body.nightlyRate !== undefined && (!Number.isInteger(nightlyRate) || nightlyRate < 1 || nightlyRate > 100_000))
    || (body.advanceAmount !== undefined && (!Number.isInteger(advanceAmount) || advanceAmount < 1 || advanceAmount >= nightlyRate))
    || (creating && (!Number.isInteger(nightlyRate) || nightlyRate < 1 || nightlyRate > 100_000))
    || (creating && (!Number.isInteger(advanceAmount) || advanceAmount < 1 || advanceAmount >= nightlyRate))
    || (!creating && ((body.nightlyRate === undefined) !== (body.advanceAmount === undefined)))
    || (body.isActive !== undefined && typeof isActive !== "boolean")
    || (amenities !== undefined && (!amenities || amenities.length > 20 || amenities.some((amenity) => !allowedAmenities.has(amenity))))) {
    return { error: "Enter a valid room type, capacity, nightly rate, advance amount, and supported amenities." };
  }
  const value = {
    ...(creating || body.name !== undefined ? { name } : {}),
    ...(creating ? { bedCount } : {}),
    ...(creating || body.capacity !== undefined ? { capacity } : {}),
    ...(amenities !== undefined ? { amenities } : {}),
    ...(creating || body.nightlyRate !== undefined ? { nightlyRate } : {}),
    ...(creating || body.advanceAmount !== undefined ? { advanceAmount } : {}),
    ...(creating || body.isActive !== undefined ? { isActive: isActive === undefined ? true : isActive } : {}),
  };
  if (!Object.keys(value).length) {
    return { error: "Provide at least one room type field to update." };
  }
  return {
    value,
  };
}

async function writeAudit(req, session, { action, entityType, entityId, changes }) {
  await AuditLog.create([{
    hotelId: req.user.hotelId,
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action,
    entityType,
    entityId: String(entityId),
    changes,
  }], { session });
}

exports.getHotelInventory = async (req, res) => {
  const hotelId = hotelIdForAdmin(req, res);
  if (!hotelId) return;
  try {
    const [roomTypes, rooms, activity] = await Promise.all([
      RoomType.find({ hotelId }).sort({ bedCount: 1, name: 1 }).lean(),
      Room.find({ hotelId }).populate("roomTypeId", "name bedCount capacity nightlyRate amenities").sort({ roomNumber: 1 }).lean(),
      AuditLog.find({ hotelId }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    return res.json({
      success: true,
      roomTypes,
      rooms: rooms.map((room) => ({ ...room, roomType: room.roomTypeId, roomTypeId: room.roomTypeId?._id })),
      activity,
    });
  } catch (error) {
    console.error("Hotel room inventory lookup failed:", error.message);
    return sendError(res, 500, "Hotel room inventory could not be loaded.");
  }
};

exports.createRoomType = async (req, res) => {
  const hotelId = hotelIdForAdmin(req, res);
  if (!hotelId) return;
  const normalized = normalizeRoomTypeInput(req.body || {}, { creating: true });
  if (normalized.error) return sendError(res, 400, normalized.error);
  const session = await mongoose.startSession();
  try {
    let roomType;
    await session.withTransaction(async () => {
      [roomType] = await RoomType.create([{ hotelId, ...normalized.value }], { session });
      await writeAudit(req, session, {
        action: "roomType.created",
        entityType: "roomType",
        entityId: roomType._id,
        changes: normalized.value,
      });
    });
    return res.status(201).json({ success: true, roomType });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, "A room type with this name already exists for the hotel.");
    console.error("Hotel room type creation failed:", error.message);
    return sendError(res, 500, "The room type could not be created.");
  } finally {
    await session.endSession();
  }
};

exports.updateRoomType = async (req, res) => {
  const hotelId = hotelIdForAdmin(req, res);
  if (!hotelId) return;
  if (!mongoose.isValidObjectId(req.params.roomTypeId)) return sendError(res, 400, "The room type ID is invalid.");
  const normalized = normalizeRoomTypeInput(req.body || {});
  if (normalized.error) return sendError(res, 400, normalized.error);
  const session = await mongoose.startSession();
  try {
    let roomType;
    await session.withTransaction(async () => {
      const currentRoomType = await RoomType.findOne({ _id: req.params.roomTypeId, hotelId }).session(session);
      if (!currentRoomType) {
        const error = new Error("The room type could not be found.");
        error.status = 404;
        throw error;
      }
      if (normalized.value.capacity !== undefined && normalized.value.capacity < currentRoomType.capacity) {
        const overCapacityReservation = await Reservation.aggregate([
          {
            $match: {
              hotelId,
              roomTypeId: currentRoomType._id,
              status: { $in: ["PaymentPending", "Confirmed", "CheckedIn"] },
            },
          },
          { $addFields: { currentGuestCount: { $add: ["$adults", { $size: "$childAges" }] } } },
          { $match: { currentGuestCount: { $gt: normalized.value.capacity } } },
          { $limit: 1 },
        ]).session(session);
        if (overCapacityReservation.length) {
          const error = new Error("Capacity cannot be reduced below the guest count of an active reservation.");
          error.status = 409;
          throw error;
        }
      }
      roomType = await RoomType.findOneAndUpdate(
        { _id: req.params.roomTypeId, hotelId },
        { $set: normalized.value },
        { new: true, runValidators: true, session },
      );
      if (!roomType) {
        const error = new Error("The room type could not be found.");
        error.status = 404;
        throw error;
      }
      await writeAudit(req, session, {
        action: "roomType.updated",
        entityType: "roomType",
        entityId: roomType._id,
        changes: normalized.value,
      });
    });
    return res.json({ success: true, roomType });
  } catch (error) {
    if (error.status === 404 || error.status === 409) return sendError(res, error.status, error.message);
    if (error.code === 11000) return sendError(res, 409, "A room type with this name already exists for the hotel.");
    console.error("Hotel room type update failed:", error.message);
    return sendError(res, 500, "The room type could not be updated.");
  } finally {
    await session.endSession();
  }
};

exports.createRoom = async (req, res) => {
  const hotelId = hotelIdForAdmin(req, res);
  if (!hotelId) return;
  const { roomTypeId } = req.params;
  const roomNumber = typeof req.body?.roomNumber === "string" ? req.body.roomNumber.trim() : "";
  if (!mongoose.isValidObjectId(roomTypeId) || !roomNumber || roomNumber.length > 30) {
    return sendError(res, 400, "Enter a valid room type and room number.");
  }
  const session = await mongoose.startSession();
  try {
    let room;
    await session.withTransaction(async () => {
      const roomType = await RoomType.findOne({ _id: roomTypeId, hotelId, isActive: true }).session(session);
      if (!roomType) {
        const error = new Error("An active room type for this hotel is required.");
        error.status = 404;
        throw error;
      }
      [room] = await Room.create([{
        hotelId,
        roomTypeId: roomType._id,
        roomNumber,
        status: "Available",
      }], { session });
      await writeAudit(req, session, {
        action: "room.created",
        entityType: "room",
        entityId: room._id,
        changes: { roomNumber, roomTypeId: String(roomType._id), status: "Available" },
      });
    });
    return res.status(201).json({ success: true, room });
  } catch (error) {
    if (error.status === 404) return sendError(res, 404, error.message);
    if (error.code === 11000) return sendError(res, 409, "That room number already exists at this hotel.");
    console.error("Hotel room creation failed:", error.message);
    return sendError(res, 500, "The room could not be created.");
  } finally {
    await session.endSession();
  }
};

exports.updateRoom = async (req, res) => {
  const hotelId = hotelIdForAdmin(req, res);
  if (!hotelId) return;
  if (!mongoose.isValidObjectId(req.params.roomId)) return sendError(res, 400, "The room ID is invalid.");
  const { roomNumber, status } = req.body || {};
  const update = {};
  if (roomNumber !== undefined) {
    if (typeof roomNumber !== "string" || !roomNumber.trim() || roomNumber.trim().length > 30) {
      return sendError(res, 400, "Enter a valid room number.");
    }
    update.roomNumber = roomNumber.trim();
  }
  if (status !== undefined) {
    if (!["Available", "OutOfService"].includes(status)) return sendError(res, 400, "Choose a valid room status.");
    update.status = status;
  }
  if (!Object.keys(update).length) return sendError(res, 400, "Provide a room number or status to update.");
  const session = await mongoose.startSession();
  try {
    let room;
    await session.withTransaction(async () => {
      const current = await Room.findOne({ _id: req.params.roomId, hotelId }).session(session);
      if (!current) {
        const error = new Error("The room could not be found.");
        error.status = 404;
        throw error;
      }
      if (update.status === "Available" && current.status === "Occupied") {
        const error = new Error("A checked-in room becomes available only after its guest is checked out.");
        error.status = 409;
        throw error;
      }
      if (update.status === "OutOfService") {
        if (current.status === "Occupied") {
          const error = new Error("An occupied room cannot be taken out of service.");
          error.status = 409;
          throw error;
        }
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const futureLock = await ReservationNight.findOne({
          roomId: current._id,
          stayDate: { $gte: today },
          isReleased: { $ne: true },
          $or: [
            { expiresAt: null },
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } },
          ],
        }).session(session);
        if (futureLock) {
          const error = new Error("This room has a current or future reservation and cannot be taken out of service.");
          error.status = 409;
          throw error;
        }
      }
      room = await Room.findOneAndUpdate(
        { _id: current._id, hotelId },
        { $set: update },
        { new: true, runValidators: true, session },
      );
      await writeAudit(req, session, {
        action: "room.updated",
        entityType: "room",
        entityId: room._id,
        changes: update,
      });
    });
    return res.json({ success: true, room });
  } catch (error) {
    if (error.status === 404 || error.status === 409) return sendError(res, error.status, error.message);
    if (error.code === 11000) return sendError(res, 409, "That room number already exists at this hotel.");
    console.error("Hotel room update failed:", error.message);
    return sendError(res, 500, "The room could not be updated.");
  } finally {
    await session.endSession();
  }
};

exports.getAvailabilityQuote = async (req, res) => {
  const body = {
    hotelId: req.query.hotelId,
    checkIn: req.query.checkIn,
    checkOut: req.query.checkOut,
    adults: Number(req.query.adults),
    childAges: String(req.query.childAges || "").split(",").filter(Boolean).map(Number),
    bedCount: Number(req.query.bedCount),
  };
  const validation = validateReservationInput(body);
  if (validation.error) return sendError(res, 400, validation.error);
  if (!hotelIds.has(body.hotelId)) return sendError(res, 404, "The selected hotel is not available for booking.");
  try {
    const stayDates = getStayDates(body.checkIn, validation.nights);
    const { roomType } = await findAvailableRoom({
      hotelId: body.hotelId,
      bedCount: body.bedCount,
      guestCount: body.adults + body.childAges.length,
      stayDates,
    });
    return res.json({
      success: true,
      available: true,
      roomType: {
        id: String(roomType._id),
        name: roomType.name,
        bedCount: roomType.bedCount,
        capacity: roomType.capacity,
        amenities: roomType.amenities,
        nightlyRate: roomType.nightlyRate,
        advanceAmount: Math.min(roomType.advanceAmount, roomType.nightlyRate - 1),
      },
      totalAmount: roomType.nightlyRate * validation.nights,
      nights: validation.nights,
    });
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.message);
    console.error("Room availability lookup failed:", error.message);
    return sendError(res, 500, "Room availability could not be checked.");
  }
};

exports.updateReservationStayStatus = async (req, res) => {
  const hotelId = hotelIdForAdmin(req, res);
  if (!hotelId) return;
  const { reservationId } = req.params;
  const { action } = req.body || {};
  if (!mongoose.isValidObjectId(reservationId) || !["check-in", "check-out"].includes(action)) {
    return sendError(res, 400, "Provide a valid reservation and check-in/check-out action.");
  }
  const session = await mongoose.startSession();
  try {
    let reservation;
    await session.withTransaction(async () => {
      const current = await Reservation.findOne({ _id: reservationId, hotelId }).session(session);
      if (!current) {
        const error = new Error("The reservation could not be found for this hotel.");
        error.status = 404;
        throw error;
      }
      const today = getTodayInIndia();
      const checkInDate = current.checkIn.toISOString().slice(0, 10);
      const checkOutDate = current.checkOut.toISOString().slice(0, 10);
      if (action === "check-in"
        && (current.status !== "Confirmed" || today < checkInDate || today >= checkOutDate)) {
        const error = new Error("Only a confirmed reservation within its stay dates can be checked in.");
        error.status = 409;
        throw error;
      }
      if (action === "check-out" && current.status !== "CheckedIn") {
        const error = new Error("Only a checked-in reservation can be checked out.");
        error.status = 409;
        throw error;
      }
      const now = new Date();
      const expectedRoomStatus = action === "check-in" ? "Available" : "Occupied";
      const nextRoomStatus = action === "check-in" ? "Occupied" : "Available";
      const room = await Room.findOneAndUpdate({
        _id: current.roomId,
        hotelId,
        status: expectedRoomStatus,
      }, {
        $set: { status: nextRoomStatus },
      }, { new: true, session });
      if (!room) {
        const error = new Error(action === "check-in"
          ? "The assigned room is already occupied or unavailable."
          : "The assigned room is not marked occupied; refresh the reservation and try again.");
        error.status = 409;
        throw error;
      }
      reservation = await Reservation.findOneAndUpdate({
        _id: current._id,
        hotelId,
        status: current.status,
      }, {
        $set: action === "check-in"
          ? { status: "CheckedIn", checkedInAt: now, stayStatusUpdatedBy: req.user._id }
          : { status: "CheckedOut", checkedOutAt: now, stayStatusUpdatedBy: req.user._id },
      }, { new: true, session });
      if (!reservation) {
        const error = new Error("The reservation changed while its stay status was being updated.");
        error.status = 409;
        throw error;
      }
      if (action === "check-out") {
        await releaseReservationRoomNights(current._id, session);
      }
      await writeAudit(req, session, {
        action: action === "check-in" ? "reservation.checkedIn" : "reservation.checkedOut",
        entityType: "reservation",
        entityId: reservation._id,
        changes: { from: current.status, to: reservation.status },
      });
    });
    return res.json({ success: true, reservation: { id: String(reservation._id), status: reservation.status } });
  } catch (error) {
    if (error.status === 404 || error.status === 409) return sendError(res, error.status, error.message);
    console.error("Hotel reservation stay status update failed:", error.message);
    return sendError(res, 500, "The reservation stay status could not be updated.");
  } finally {
    await session.endSession();
  }
};
