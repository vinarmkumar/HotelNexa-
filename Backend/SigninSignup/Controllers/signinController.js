const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const { sendError, createToken, publicUser, setAuthCookie, readAuthToken } = require("./authHelper");

exports.signin = async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = req.body.password;
    const adminLogin = req.body.adminLogin === true;
    if (!email || typeof password !== "string") return sendError(res, 400, "Email and password are required.");

    const user = await User.findOne({ email }).select("+password +loginAttempts +loginLockUntil +googleSub");
    if (user?.loginLockUntil && user.loginLockUntil > new Date()) {
      return res.status(429).json({ success: false, message: "Too many failed sign-in attempts. Try again shortly." });
    }
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      if (user) {
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        if (user.loginAttempts >= 5) user.loginLockUntil = new Date(Date.now() + 60_000);
        await user.save();
      }
      if (user && !user.password && user.googleSub) {
        return sendError(res, 401, "This account uses Google sign-in. Continue with Google, or choose Forgot password to set a HotelNexa password.");
      }
      return sendError(res, 401, "Email or password is incorrect.");
    }
    const privilegedRole = ["admin", "staff", "hotelAdmin"].includes(user.role);
    if (privilegedRole && !adminLogin) return sendError(res, 403, "Select the hotel or administrator sign-in option.");
    if (adminLogin && !privilegedRole) return sendError(res, 403, "This account does not have hotel administrator access.");
    if (user.role !== "hotelAdmin" && !user.emailVerified) {
      return sendError(res, 403, "Verify your email address before signing in.");
    }

    user.loginAttempts = 0;
    user.loginLockUntil = null;
    await user.save();
    setAuthCookie(res, createToken(user));
    return res.json({ success: true, message: "Welcome to HotelNexa.", user: publicUser(user) });
  } catch (error) {
    console.error("Sign-in failed:", error.message);
    return sendError(res, 500, "Sign-in could not be completed.");
  }
};

exports.signout = (_req, res) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `hotelnexa_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
  return res.json({ success: true, message: "You have signed out." });
};

exports.authenticate = async (req, res, next) => {
  try {
    const token = readAuthToken(req);
    if (!token) return sendError(res, 401, "Please sign in to continue.");
    const payload = jwt.verify(decodeURIComponent(token), process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || user.role !== payload.role) return sendError(res, 401, "Your session is no longer valid. Please sign in again.");
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.name === "URIError") {
      return sendError(res, 401, "Your session expired. Please sign in again.");
    }
    console.error("Authentication check failed:", error.message);
    return sendError(res, 500, "Your session could not be checked.");
  }
};

exports.requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return sendError(res, 403, "Administrator access is required.");
  return next();
};

exports.requireStaffOrAdmin = (req, res, next) => {
  if (!["staff", "admin"].includes(req.user?.role)) {
    return sendError(res, 403, "Staff or administrator access is required.");
  }
  return next();
};

exports.requireHotelAdmin = (req, res, next) => {
  if (req.user?.role !== "hotelAdmin") return sendError(res, 403, "Hotel administrator access is required.");
  if (req.user.mustChangePassword) {
    return sendError(res, 403, "Change your temporary password before accessing hotel operations.");
  }
  return next();
};

exports.getCurrentUser = (req, res) => res.json({ success: true, user: publicUser(req.user) });