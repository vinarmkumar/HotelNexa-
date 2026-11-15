const mongoose = require("mongoose");

const otpRateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

otpRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.OtpRateLimit || mongoose.model("OtpRateLimit", otpRateLimitSchema);
