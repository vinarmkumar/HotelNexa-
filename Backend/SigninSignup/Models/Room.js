const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  hotelId: { type: String, required: true, trim: true, maxlength: 200 },
  roomTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "RoomType", required: true, index: true },
  roomNumber: { type: String, required: true, trim: true, maxlength: 30 },
  status: { type: String, enum: ["Available", "Occupied", "OutOfService"], default: "Available", required: true },
}, { timestamps: true });

roomSchema.index({ hotelId: 1, roomNumber: 1 }, { unique: true });
roomSchema.index({ hotelId: 1, roomTypeId: 1, status: 1 });

module.exports = mongoose.models.Room || mongoose.model("Room", roomSchema);
