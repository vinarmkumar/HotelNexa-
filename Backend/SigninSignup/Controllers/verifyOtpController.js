const User = require("../Models/User");
const TempUser = require("../Models/TempUser");
const { sendError, otpMatches, createToken, publicUser, setAuthCookie } = require("./authHelper");

exports.verifyOtp = async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const emailOtp = String(req.body.emailOtp || "").trim();
    if (!email || !/^\d{6}$/.test(emailOtp)) return sendError(res, 400, "Enter the 6-digit email verification code.");
    const pending = await TempUser.findOne({ email }).select("+emailOtpHash +password");
    if (!pending) return sendError(res, 400, "Signup verification expired. Please create your account again.");
    if (pending.otpExpiresAt <= new Date()) {
      await TempUser.deleteOne({ _id: pending._id });
      return sendError(res, 400, "Verification codes expired. Please sign up again.");
    }
    if (pending.otpAttempts >= 5) {
      await TempUser.deleteOne({ _id: pending._id });
      return sendError(res, 429, "Too many incorrect codes. Please sign up again.");
    }
    if (!otpMatches(emailOtp, pending.emailOtpHash)) {
      pending.otpAttempts += 1;
      if (pending.otpAttempts >= 5) await TempUser.deleteOne({ _id: pending._id });
      else await pending.save();
      return sendError(res, 400, "The email verification code is incorrect.");
    }

    const user = await User.create({
      name: pending.name, email: pending.email, phone: pending.phone || "",
      password: pending.password,
      role: "guest", emailVerified: true,
    });
    await TempUser.deleteOne({ _id: pending._id });
    setAuthCookie(res, createToken(user));
    return res.status(201).json({ success: true, message: "Your HotelNexa account is verified.", user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, "An account already uses this email.");
    console.error("Signup verification failed:", error.message);
    return sendError(res, 500, "Your account could not be verified.");
  }
};