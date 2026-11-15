const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: "", trim: true, maxlength: 25 },
  password: { type: String, default: "", select: false },
  googleSub: { type: String, default: undefined, unique: true, sparse: true, select: false },
  role: { type: String, enum: ["guest", "staff", "admin", "hotelAdmin"], default: "guest", required: true },
  hotelId: { type: String, default: "", trim: true, maxlength: 300 },
  mustChangePassword: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  loginAttempts: { type: Number, default: 0, select: false },
  loginLockUntil: { type: Date, default: null, select: false },
  resetOtpHash: { type: String, default: "", select: false },
  resetOtpExpiresAt: { type: Date, default: null, select: false },
  resetOtpSentAt: { type: Date, default: null, select: false },
  resetOtpAttempts: { type: Number, default: 0, select: false },
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
