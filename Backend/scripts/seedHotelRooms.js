require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
const connectDatabase = require("../SigninSignup/database");
const Room = require("../SigninSignup/Models/Room");
const RoomType = require("../SigninSignup/Models/RoomType");
const Reservation = require("../SigninSignup/Models/Reservation");
const ReservationNight = require("../SigninSignup/Models/ReservationNight");
const hotelDirectoryPaths = require("../../Shared/hotelDirectoryPaths.json");
const { getTrustedAdvanceAmount, getTrustedNightlyRate } = require("../SigninSignup/Services/hotelPricing");

const initialRoomTypes = [1, 2, 3, 4].map((bedCount) => ({
  bedCount,
  name: `${bedCount}-bed standard`,
}));

async function seedHotel(hotelId) {
  for (const { bedCount, name } of initialRoomTypes) {
    const nightlyRate = getTrustedNightlyRate(hotelId, bedCount);
    const roomType = await RoomType.findOneAndUpdate({
      hotelId,
      name,
    }, {
      $setOnInsert: {
        hotelId,
        name,
        bedCount,
        capacity: bedCount,
        amenities: ["Wi-Fi", "Private bathroom", "Air conditioning"],
        nightlyRate,
        advanceAmount: getTrustedAdvanceAmount(hotelId, bedCount, nightlyRate),
        isActive: true,
      },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });

    await Room.findOneAndUpdate({
      hotelId,
      roomNumber: String(bedCount * 100 + 1),
    }, {
      $setOnInsert: {
        hotelId,
        roomTypeId: roomType._id,
        roomNumber: String(bedCount * 100 + 1),
        status: "Available",
      },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
}

async function migrateExistingReservations() {
  const hotelIds = await Reservation.distinct("hotelId");
  if (!hotelIds.length) return { reservations: 0, roomNights: 0 };
  const roomTypeNames = new Map(initialRoomTypes.map(({ bedCount, name }) => [bedCount, name]));
  const roomTypes = await RoomType.find({
    hotelId: { $in: hotelIds },
    name: { $in: [...roomTypeNames.values()] },
  }).lean();
  const typesByKey = new Map(roomTypes.map((type) => [`${type.hotelId}|${type.bedCount}`, type]));
  const rooms = await Room.find({ hotelId: { $in: hotelIds } }).lean();
  const roomTypesById = new Map(roomTypes.map((roomType) => [String(roomType._id), roomType]));
  const roomsByType = new Map();
  for (const room of rooms) {
    const roomType = roomTypesById.get(String(room.roomTypeId));
    if (roomType && room.roomNumber === String(roomType.bedCount * 100 + 1)) {
      roomsByType.set(`${room.hotelId}|${roomType.bedCount}`, room);
    }
  }
  const reservations = await Reservation.find({ hotelId: { $in: hotelIds } })
    .select("_id hotelId bedCount roomId roomTypeId").lean();
  const reservationUpdates = [];

  for (const reservation of reservations) {
    if (reservation.roomId && reservation.roomTypeId) continue;
    const roomType = typesByKey.get(`${reservation.hotelId}|${reservation.bedCount}`);
    const room = roomsByType.get(`${reservation.hotelId}|${reservation.bedCount}`);
    if (!roomType || !room || String(room.roomTypeId) !== String(roomType._id)) {
      throw new Error(`Could not map reservation ${reservation._id} to a seeded room.`);
    }
    reservationUpdates.push({
      updateOne: {
        filter: { _id: reservation._id, $or: [{ roomId: null }, { roomId: { $exists: false } }] },
        update: { $set: { roomId: room._id, roomTypeId: roomType._id } },
      },
    });
  }
  if (reservationUpdates.length) await Reservation.bulkWrite(reservationUpdates, { ordered: true });

  const oldLocks = await ReservationNight.find({
    $or: [{ roomId: null }, { roomId: { $exists: false } }],
  }).select("_id reservationId stayDate hotelId bedCount").lean();
  const reservationsById = new Map((await Reservation.find({
    _id: { $in: [...new Set(oldLocks.map((lock) => String(lock.reservationId)))] },
  }).select("_id hotelId bedCount roomId roomTypeId").lean()).map((entry) => [String(entry._id), entry]));
  const roomsById = new Map(rooms.map((room) => [String(room._id), room]));
  const lockUpdates = [];
  for (const lock of oldLocks) {
    const reservation = reservationsById.get(String(lock.reservationId));
    const room = reservation?.roomId
      ? roomsById.get(String(reservation.roomId))
      : roomsByType.get(`${lock.hotelId}|${lock.bedCount}`);
    if (!room) throw new Error(`Could not map room-night hold ${lock._id} to a seeded room.`);
    const date = lock.stayDate.toISOString().slice(0, 10);
    lockUpdates.push({
      updateOne: {
        filter: { _id: lock._id },
        update: {
          $set: {
            roomId: room._id,
            roomKey: `${room._id}|${date}`,
          },
        },
      },
    });
  }
  if (lockUpdates.length) await ReservationNight.bulkWrite(lockUpdates, { ordered: true });
  return { reservations: reservationUpdates.length, roomNights: lockUpdates.length };
}

async function main() {
  await connectDatabase();
  await Promise.all([RoomType.init(), Room.init(), Reservation.init(), ReservationNight.init()]);
  for (const hotelId of hotelDirectoryPaths) await seedHotel(hotelId);
  const migrated = await migrateExistingReservations();
  console.log(`Room inventory ready for ${hotelDirectoryPaths.length} hotels; migrated ${migrated.reservations} reservations and ${migrated.roomNights} room-night locks.`);
}

main()
  .catch((error) => {
    console.error("Hotel room inventory seeding failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = require("mongoose");
    await mongoose.disconnect();
  });
