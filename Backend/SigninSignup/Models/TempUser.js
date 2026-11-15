const mongoose = require("mongoose");

const tempUserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, default: "", trim: true, maxlength: 25 },
  password: { type: String, required: true, select: false },
  emailOtpHash: { type: String, required: true, select: false },
  otpExpiresAt: { type: Date, required: true },
  otpSentAt: { type: Date, required: true },
  otpAttempts: { type: Number, default: 0 },
}, { timestamps: true });

tempUserSchema.index({ email: 1 }, { unique: true });
tempUserSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.TempUser || mongoose.model("TempUser", tempUserSchema);