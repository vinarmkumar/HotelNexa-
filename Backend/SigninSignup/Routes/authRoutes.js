const express = require("express");
const { signup } = require("../Controllers/signupController");
const { verifyOtp } = require("../Controllers/verifyOtpController");
const { signin, signout, authenticate, requireAdmin, getCurrentUser } = require("../Controllers/signinController");
const { forgotPassword, resetPassword, changeHotelAdminPassword } = require("../Controllers/passwordResetController");
const { googleAutoSignin } = require("../Googleautosignin/googleAutoSignin");

const router = express.Router();
router.post("/signup", signup);
router.post("/verify-otp", verifyOtp);
router.post("/signin", signin);
router.post("/google", googleAutoSignin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/hotel-admin/change-password", authenticate, changeHotelAdminPassword);
router.post("/signout", signout);
router.get("/me", authenticate, getCurrentUser);
router.get("/admin", authenticate, requireAdmin, (_req, res) => {
  res.json({ success: true, message: "Administrator access verified." });
});

module.exports = router;