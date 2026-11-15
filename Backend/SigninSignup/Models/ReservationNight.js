const mongoose = require("mongoose");

const reservationNightSchema = new mongoose.Schema({
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", required: true, index: true },
  hotelId: { type: String, required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null, index: true },
  bedCount: { type: Number, required: true, min: 1, max: 4 },
  stayDate: { type: Date, required: true },
  roomKey: { type: String, required: true, unique: true },
  isReleased: { type: Boolean, default: false, index: true },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

reservationNightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: "date" } } });
reservationNightSchema.index({ stayDate: 1, reservationId: 1 });

module.exports = mongoose.models.ReservationNight || mongoose.model("ReservationNight", reservationNightSchema);
