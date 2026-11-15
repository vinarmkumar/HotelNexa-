const Room = require("../Models/Room");
const RoomType = require("../Models/RoomType");
const ReservationNight = require("../Models/ReservationNight");
const { getTodayInIndia } = require("./reservationValidation");

function roomUnavailableError() {
  const error = new Error("No suitable room is available for the selected dates and guests.");
  error.status = 409;
  return error;
}

async function findAvailableRoom({
  hotelId,
  bedCount,
  guestCount,
  stayDates,
  session,
  removeExpiredLocks = false,
  roomTypeId,
}) {
  const roomTypeFilter = {
    hotelId,
    bedCount,
    capacity: { $gte: guestCount },
    isActive: true,
    ...(roomTypeId ? { _id: roomTypeId } : {}),
  };
  const roomTypeQuery = RoomType.find(roomTypeFilter).sort({ nightlyRate: 1, name: 1 });
  if (session) roomTypeQuery.session(session);
  const roomTypes = await roomTypeQuery.lean();
  if (!roomTypes.length) throw roomUnavailableError();

  const roomTypesById = new Map(roomTypes.map((roomType) => [String(roomType._id), roomType]));
  const roomQuery = Room.find({
    hotelId,
    roomTypeId: { $in: roomTypes.map((roomType) => roomType._id) },
    status: { $in: ["Available", "Occupied"] },
  }).sort({ roomNumber: 1 });
  if (session) roomQuery.session(session);
  const rooms = await roomQuery.lean();
  if (!rooms.length) throw roomUnavailableError();

  const roomIds = rooms.map((room) => room._id);
  const stayDateSet = new Set(stayDates.map((date) => date.toISOString().slice(0, 10)));
  if (removeExpiredLocks) {
    let expiredLocks = ReservationNight.deleteMany({
      roomId: { $in: roomIds },
      stayDate: { $in: stayDates },
      isReleased: { $ne: true },
      expiresAt: { $lte: new Date() },
    });
    if (session) expiredLocks = expiredLocks.session(session);
    await expiredLocks;
  }

  const lockFilter = {
    roomId: { $in: roomIds },
    stayDate: { $in: stayDates },
    isReleased: { $ne: true },
    $or: [
      { expiresAt: null },
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } },
    ],
  };
  let lockQuery = ReservationNight.find(lockFilter).select("roomId stayDate");
  if (session) lockQuery = lockQuery.session(session);
  const locks = await lockQuery.lean();
  const occupied = new Set(locks.map((lock) =>
    `${String(lock.roomId)}|${lock.stayDate.toISOString().slice(0, 10)}`));

  for (const room of rooms) {
    const available = stayDates.every((date) =>
      !occupied.has(`${String(room._id)}|${date.toISOString().slice(0, 10)}`));
    if (available) {
      return { room, roomType: roomTypesById.get(String(room.roomTypeId)) };
    }
  }
  throw roomUnavailableError();
}

async function releaseReservationRoomNights(reservationId, session) {
  const firstReleasableNight = new Date(`${getTodayInIndia()}T00:00:00.000Z`);
  const locks = await ReservationNight.find({
    reservationId,
    isReleased: { $ne: true },
    stayDate: { $gte: firstReleasableNight },
  }).session(session);
  for (const lock of locks) {
    lock.isReleased = true;
    lock.roomKey = `${lock.roomKey}|released|${reservationId}`;
    await lock.save({ session });
  }
}

module.exports = { findAvailableRoom, releaseReservationRoomNights };
