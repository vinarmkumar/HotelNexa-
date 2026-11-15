const bcrypt = require("bcryptjs");
const User = require("../Models/User");
const TempUser = require("../Models/TempUser");
const { sendOtpEmail } = require("../Middleware/Email");
const { claimOtpCooldown, clearOtpCooldown } = require("./otpRateLimit");
const { sendError, makeOtp, hashOtp, isValidEmail, isValidPhone, isStrongPassword } = require("./authHelper");

exports.signup = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").toLowerCase().trim();
    const phone = String(req.body.phone || "").trim();
    const password = req.body.password;
    if (!name || name.length > 80 || !isValidEmail(email)
      || !isValidPhone(phone) || !isStrongPassword(password)) {
      return sendError(res, 400, "Enter a valid name, email, phone number, and a password with 8+ characters, uppercase, lowercase, a number, and one special character from @#$%^&*.");
    }
    if (await User.exists({ email })) {
      return sendError(res, 409, "An account already uses this email.");
    }
    const emailAllowed = await claimOtpCooldown("signup-email", email);
    if (!emailAllowed) {
      return res.status(429).json({ success: false, message: "Please wait before requesting another verification code." });
    }

    const emailOtp = makeOtp();
    const passwordHash = await bcrypt.hash(password, 12);
    await TempUser.findOneAndUpdate(
      { email },
      {
        name, email, phone, password: passwordHash,
        emailOtpHash: hashOtp(emailOtp),
        otpExpiresAt: new Date(Date.now() + 10 * 60_000), otpSentAt: new Date(), otpAttempts: 0,
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    try {
      await sendOtpEmail(email, emailOtp, name);
    } catch (error) {
      await TempUser.deleteOne({ email });
      await clearOtpCooldown("signup-email", email);
      console.error("Signup verification delivery failed:", error.message);
      return sendError(res, 502, `Email verification code delivery failed — ${error.message}`);
    }
    return res.status(200).json({
      success: true,
      message: "An email verification code has been sent.",
      email,
    });
  } catch (error) {
    console.error("Signup failed:", error.message);
    return sendError(res, 500, "Account creation could not be started.");
  }
};