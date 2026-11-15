const crypto = require("node:crypto");
const OtpRateLimit = require("../Models/OtpRateLimit");

async function claimOtpCooldown(scope, identifier, cooldownSeconds = 60) {
  const key = crypto.createHmac("sha256", process.env.JWT_SECRET)
    .update(`${scope}:${String(identifier).toLowerCase()}`)
    .digest("hex");
  const now = new Date();
  try {
    await OtpRateLimit.findOneAndUpdate(
      { key, sentAt: { $lte: new Date(now.getTime() - cooldownSeconds * 1000) } },
      { $set: { sentAt: now, expiresAt: new Date(now.getTime() + 10 * 60_000) } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

async function clearOtpCooldown(scope, identifier) {
  const key = crypto.createHmac("sha256", process.env.JWT_SECRET)
    .update(`${scope}:${String(identifier).toLowerCase()}`)
    .digest("hex");
  await OtpRateLimit.deleteOne({ key });
}

module.exports = { claimOtpCooldown, clearOtpCooldown };