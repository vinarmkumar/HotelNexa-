const mongoose = require("mongoose");

const roomTypeSchema = new mongoose.Schema({
  hotelId: { type: String, required: true, trim: true, maxlength: 200 },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  bedCount: { type: Number, required: true, min: 1, max: 4 },
  capacity: { type: Number, required: true, min: 1, max: 20 },
  amenities: { type: [String], default: [] },
  nightlyRate: { type: Number, required: true, min: 1 },
  advanceAmount: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

roomTypeSchema.index({ hotelId: 1, name: 1 }, { unique: true });
roomTypeSchema.index({ hotelId: 1, bedCount: 1, isActive: 1 });

module.exports = mongoose.models.RoomType || mongoose.model("RoomType", roomTypeSchema);
