const Reservation = require("../Models/Reservation");
const Room = require("../Models/Room");
const User = require("../Models/User");
const { getReservationPaymentAmounts, hotelIds } = require("../Services/hotelPricing");
const mongoose = require("mongoose");

function titleCase(value) {
  return value.split("_").filter(Boolean).map((word) =>
    `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

function getHotelName(hotelId) {
  const hotelFolder = hotelId.split("/").at(-1) || "";
  return `Hotel ${titleCase(hotelFolder.replace(/^hotel_/, ""))}`;
}

exports.getHotelOverview = async (req, res) => {
  try {
    const { hotelId } = req.user;
    if (!hotelId || !hotelIds.has(hotelId)) {
      return res.status(403).json({ success: false, message: "This account is not assigned to a hotel in the directory." });
    }

    const queryParams = req.query || {};
    const page = Math.max(1, Number.parseInt(queryParams.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(queryParams.pageSize, 10) || 20));
    const search = typeof queryParams.search === "string" ? queryParams.search.trim().slice(0, 100) : "";
    const filter = {
      hotelId,
      status: { $in: ["Confirmed", "CheckedIn", "CheckedOut", "CancellationPending", "Cancelled"] },
    };
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hotelGuestIds = await Reservation.distinct("userId", { hotelId });
      const matchingGuests = await User.find({
        _id: { $in: hotelGuestIds },
        $or: [
          { name: { $regex: escapedSearch, $options: "i" } },
          { email: { $regex: escapedSearch, $options: "i" } },
        ],
      }).select("_id").lean();
      const searchFilters = [
        { userId: { $in: matchingGuests.map((guest) => guest._id) } },
        ...(mongoose.isValidObjectId(search) ? [{ _id: search }] : []),
      ];
      filter.$or = searchFilters.length ? searchFilters : [{ _id: null }];
    }
    const [total, reservations, allGuestGroups, cancellationHistory] = await Promise.all([
      Reservation.countDocuments(filter),
      Reservation.find(filter).sort({ checkIn: -1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Reservation.aggregate([
        { $match: { hotelId, status: { $in: ["Confirmed", "CheckedIn", "CheckedOut", "CancellationPending", "Cancelled"] } } },
        { $group: { _id: "$userId", bookings: { $sum: 1 }, latestCheckIn: { $max: "$checkIn" } } },
        { $sort: { latestCheckIn: -1 } },
      ]),
      Reservation.find({
        hotelId,
        status: { $in: ["CancellationPending", "Cancelled"] },
      }).sort({ cancelledAt: -1, cancellationRequestedAt: -1 }).limit(100).lean(),
    ]);
    const guestIds = [...new Set(reservations.map((reservation) => String(reservation.userId)))];
    const allGuestIds = [...new Set(allGuestGroups.map((guest) => String(guest._id)))];
    const roomIds = [...new Set(reservations.map((reservation) => reservation.roomId).filter(Boolean).map(String))];
    const [guests, allGuests, rooms] = await Promise.all([
      User.find({ _id: { $in: guestIds } }).select("name email phone").lean(),
      User.find({ _id: { $in: allGuestIds } }).select("name email phone").lean(),
      Room.find({ _id: { $in: roomIds } }).select("roomNumber").lean(),
    ]);
    const guestsById = new Map(guests.map((guest) => [String(guest._id), guest]));
    const allGuestsById = new Map(allGuests.map((guest) => [String(guest._id), guest]));
    const roomsById = new Map(rooms.map((room) => [String(room._id), room]));

    const bookings = reservations.map((reservation) => {
      const guest = guestsById.get(String(reservation.userId));
      const { totalAmount, amountPaid, balanceDue } = getReservationPaymentAmounts(reservation);
      return {
        id: String(reservation._id),
        guestName: guest?.name || "HotelNexa guest",
        guestEmail: guest?.email || "",
        guestPhone: guest?.phone || "",
        roomNumber: roomsById.get(String(reservation.roomId))?.roomNumber || "",
        roomId: reservation.roomId ? String(reservation.roomId) : "",
        checkIn: reservation.checkIn.toISOString().slice(0, 10),
        checkOut: reservation.checkOut.toISOString().slice(0, 10),
        checkedInAt: reservation.checkedInAt || null,
        checkedOutAt: reservation.checkedOutAt || null,
        nights: reservation.nights,
        bedCount: reservation.bedCount,
        guestCount: reservation.adults + reservation.childAges.length,
        status: reservation.status,
        paymentStatus: reservation.paymentStatus,
        paymentType: reservation.paymentType || "Full",
        totalAmount,
        amountPaid,
        balanceDue,
        balancePaymentInProgress: Boolean(reservation.balanceOrderId && balanceDue > 0),
        transactionId: reservation.transactionId || "",
        balanceTransactionId: reservation.balanceTransactionId || "",
        refundId: reservation.refundId || "",
        refundStatus: reservation.refundStatus,
        cancellationRequestedAt: reservation.cancellationRequestedAt,
        cancelledAt: reservation.cancelledAt,
        cancellationInitiatedBy: reservation.cancellationInitiatedBy || "",
        cancellationActorName: reservation.cancellationActorName || "",
        cancellationReason: reservation.cancellationReason || "",
        createdAt: reservation.createdAt,
      };
    });
    const confirmedSummary = await Reservation.aggregate([
      { $match: { hotelId, status: { $in: ["Confirmed", "CheckedIn", "CheckedOut"] }, paymentStatus: "Success" } },
      { $group: {
        _id: null,
        confirmedBookings: { $sum: 1 },
        revenueINR: { $sum: { $ifNull: ["$amountPaid", "$amount"] } },
      } },
    ]);

    return res.json({
      success: true,
      hotel: { id: hotelId, name: getHotelName(hotelId) },
      summary: {
        confirmedBookings: confirmedSummary[0]?.confirmedBookings || 0,
        uniqueGuests: allGuests.length,
        revenueINR: confirmedSummary[0]?.revenueINR || 0,
      },
      bookings,
      cancellationHistory: cancellationHistory.map((reservation) => {
        const guest = guestsById.get(String(reservation.userId)) || allGuestsById.get(String(reservation.userId));
        const { totalAmount, amountPaid, balanceDue } = getReservationPaymentAmounts(reservation);
        return {
          ...reservation,
          id: String(reservation._id),
          guestName: guest?.name || "HotelNexa guest",
          guestEmail: guest?.email || "",
          guestPhone: guest?.phone || "",
          checkIn: reservation.checkIn.toISOString().slice(0, 10),
          checkOut: reservation.checkOut.toISOString().slice(0, 10),
          totalAmount,
          amountPaid,
          balanceDue,
        };
      }),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      guests: allGuestGroups.map((group) => {
        const guest = allGuestsById.get(String(group._id));
        return guest ? {
          name: guest.name,
          email: guest.email,
          phone: guest.phone,
          bookings: group.bookings,
          latestCheckIn: group.latestCheckIn.toISOString().slice(0, 10),
        } : null;
      }).filter(Boolean),
    });
  } catch (error) {
    console.error("Hotel administrator overview lookup failed:", error.message);
    return res.status(500).json({ success: false, message: "Hotel guest and reservation data could not be loaded." });
  }
};
