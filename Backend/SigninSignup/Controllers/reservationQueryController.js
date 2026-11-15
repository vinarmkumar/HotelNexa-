const Reservation = require("../Models/Reservation");
const ReservationNight = require("../Models/ReservationNight");
const { isDateOnly } = require("../Services/reservationValidation");
const { publicReservation, sendError } = require("./reservationHelpers");

exports.getMyReservations = async (req, res) => {
  try {
    const reservations = await Reservation.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ success: true, reservations: reservations.map(publicReservation) });
  } catch (error) {
    console.error("Reservation history lookup failed:", error.message);
    return sendError(res, 500, "Reservation history could not be loaded.");
  }
};

exports.getReports = async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    const activeStatus = { $in: ["Confirmed", "CheckedIn", "CheckedOut"] };
    const bookingMatch = { paymentStatus: "Success", status: activeStatus };
    if ((from && !isDateOnly(from)) || (to && !isDateOnly(to)) || (from && to && from > to)) {
      return sendError(res, 400, "Report dates must use YYYY-MM-DD.");
    }
    if (from || to) {
      bookingMatch.checkIn = {};
      if (from) bookingMatch.checkIn.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) bookingMatch.checkIn.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    const roomNightDateMatch = {};
    const departureDateMatch = {};
    if (from) {
      roomNightDateMatch.$gte = new Date(`${from}T00:00:00.000Z`);
      departureDateMatch.$gte = new Date(`${from}T00:00:00.000Z`);
    }
    if (to) {
      roomNightDateMatch.$lte = new Date(`${to}T00:00:00.000Z`);
      departureDateMatch.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    const [summary = { bookings: 0, revenue: 0 }, dailyOccupancy, arrivals, departures] = await Promise.all([
      Reservation.aggregate([{
        $match: bookingMatch,
      }, {
        $group: {
          _id: null,
          bookings: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$amountPaid", "$amount"] } },
        },
      }]).then((rows) => rows[0]),
      ReservationNight.aggregate([
        { $match: { stayDate: roomNightDateMatch, isReleased: { $ne: true } } },
        { $lookup: { from: "reservations", localField: "reservationId", foreignField: "_id", as: "reservation" } },
        { $unwind: "$reservation" },
        { $match: { "reservation.paymentStatus": "Success", "reservation.status": activeStatus } },
        { $group: { _id: "$stayDate", occupiedRoomNights: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Reservation.aggregate([
        { $match: { ...bookingMatch, ...(from || to ? { checkIn: bookingMatch.checkIn } : {}) } },
        { $group: { _id: "$checkIn", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Reservation.aggregate([
        { $match: {
          paymentStatus: "Success",
          status: activeStatus,
          ...(Object.keys(departureDateMatch).length ? { checkOut: departureDateMatch } : {}),
        } },
        { $group: { _id: "$checkOut", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const dailyOccupancyData = dailyOccupancy.map((day) => ({
      date: day._id.toISOString().slice(0, 10),
      occupiedRooms: day.occupiedRoomNights,
    }));

    return res.json({
      success: true,
      summary: {
        confirmedBookings: summary.bookings,
        revenueINR: summary.revenue,
        bookedRoomNights: dailyOccupancyData.reduce((total, day) => total + day.occupiedRooms, 0),
      },
      dailyOccupancy: dailyOccupancyData,
      arrivals: arrivals.map((day) => ({
        date: day._id.toISOString().slice(0, 10),
        count: day.count,
      })),
      departures: departures.map((day) => ({
        date: day._id.toISOString().slice(0, 10),
        count: day.count,
      })),
    });
  } catch (error) {
    console.error("Reservation report lookup failed:", error.message);
    return sendError(res, 500, "Reservation reports could not be loaded.");
  }
};
