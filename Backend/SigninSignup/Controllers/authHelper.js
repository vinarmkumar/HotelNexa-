const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function makeOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(String(otp)).digest("hex");
}

function otpMatches(otp, expectedHash) {
  const actual = Buffer.from(hashOtp(otp), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  if (typeof phone !== "string" || phone.length > 25 || !/^\+?[0-9\s()-]+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function isStrongPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128
    && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
    && /[@#$%^&*]/.test(password);
}

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  const result = { id: user.id, name: user.name, email: user.email, role: user.role };
  if (user.role === "hotelAdmin") {
    result.hotelId = user.hotelId;
    result.mustChangePassword = Boolean(user.mustChangePassword);
  }
  return result;
}

function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `hotelnexa_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
}

function readAuthToken(req) {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer;
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("hotelnexa_token="));
  return cookie ? cookie.slice("hotelnexa_token=".length) : "";
}

module.exports = {
  sendError, makeOtp, hashOtp, otpMatches, isValidEmail, isValidPhone,
  isStrongPassword, createToken, publicUser, setAuthCookie, readAuthToken,
};