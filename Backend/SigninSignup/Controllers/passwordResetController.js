const bcrypt = require("bcryptjs");
const User = require("../Models/User");
const { sendOtpEmail } = require("../Middleware/Email");
const {
  sendError,
  makeOtp,
  hashOtp,
  otpMatches,
  isValidEmail,
  isStrongPassword,
  publicUser,
} = require("./authHelper");

exports.forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    if (!isValidEmail(email)) return sendError(res, 400, "Enter a valid email address.");
    const user = await User.findOne({ email }).select("+resetOtpSentAt");
    if (user?.role === "hotelAdmin") {
      return sendError(res, 403, "Hotel administrator password resets are managed by HotelNexa; email OTP reset is disabled for these accounts.");
    }
    if (user) {
      if (user.resetOtpSentAt && Date.now() - user.resetOtpSentAt.getTime() < 60_000) {
        return res.json({ success: true, message: "If the account exists, a password reset code has been sent." });
      }
      const otp = makeOtp();
      user.resetOtpHash = hashOtp(otp);
      user.resetOtpExpiresAt = new Date(Date.now() + 10 * 60_000);
      user.resetOtpSentAt = new Date();
      user.resetOtpAttempts = 0;
      await user.save();
      await sendOtpEmail(email, otp, user.name, "reset your password");
    }
    return res.json({ success: true, message: "If the account exists, a password reset code has been sent." });
  } catch (error) {
    console.error("Password reset request failed:", error.message);
    return sendError(res, 502, "The password reset email could not be sent.");
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const otp = String(req.body.otp || "").trim();
    const password = req.body.newPassword;
    if (!isValidEmail(email) || !/^\d{6}$/.test(otp) || !isStrongPassword(password)) {
      return sendError(res, 400, "Enter a valid email, 6-digit code, and a password with 8+ characters, uppercase, lowercase, a number, and one special character from @#$%^&*.");
    }
    const user = await User.findOne({ email }).select("+password +resetOtpHash +resetOtpExpiresAt +resetOtpAttempts");
    if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt || user.resetOtpExpiresAt <= new Date() || user.resetOtpAttempts >= 5) {
      return sendError(res, 400, "The password reset code is invalid or expired.");
    }
    if (!otpMatches(otp, user.resetOtpHash)) {
      user.resetOtpAttempts += 1;
      if (user.resetOtpAttempts >= 5) {
        user.resetOtpHash = "";
        user.resetOtpExpiresAt = null;
      }
      await user.save();
      return sendError(res, 400, "The password reset code is invalid or expired.");
    }
    if (user.password && await bcrypt.compare(password, user.password)) return sendError(res, 400, "Choose a password different from your current one.");
    user.password = await bcrypt.hash(password, 12);
    user.resetOtpHash = "";
    user.resetOtpExpiresAt = null;
    user.resetOtpAttempts = 0;
    await user.save();
    return res.json({ success: true, message: "Password updated. You can now sign in." });
  } catch (error) {
    console.error("Password reset failed:", error.message);
    return sendError(res, 500, "The password could not be reset.");
  }
};

exports.changeHotelAdminPassword = async (req, res) => {
  try {
    if (req.user.role !== "hotelAdmin") {
      return sendError(res, 403, "Only hotel administrator accounts can use this password setup flow.");
    }
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || !isStrongPassword(newPassword)) {
      return sendError(res, 400, "Enter your temporary password and choose a strong new password.");
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user || !user.password || !(await bcrypt.compare(currentPassword, user.password))) {
      return sendError(res, 401, "The temporary password is incorrect.");
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return sendError(res, 400, "Choose a password different from your temporary password.");
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    await user.save();
    return res.json({ success: true, message: "Your password was updated.", user: publicUser(user) });
  } catch (error) {
    console.error("Hotel administrator password change failed:", error.message);
    return sendError(res, 500, "Your password could not be updated.");
  }
};