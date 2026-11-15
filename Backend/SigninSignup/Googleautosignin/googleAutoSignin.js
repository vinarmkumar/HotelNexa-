const { OAuth2Client } = require("google-auth-library");
const User = require("../Models/User");
const TempUser = require("../Models/TempUser");
const { sendError, createToken, publicUser, setAuthCookie } = require("../Controllers/authHelper");

let googleClient;

function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");
  if (!googleClient) googleClient = new OAuth2Client(clientId);
  return { clientId, client: googleClient };
}

exports.googleAutoSignin = async (req, res) => {
  try {
    const { clientId, client } = getGoogleClient();
    const credential = req.body.credential;
    if (typeof credential !== "string" || credential.length > 10_000) {
      return sendError(res, 400, "A valid Google credential is required.");
    }

    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const email = String(payload?.email || "").toLowerCase().trim();
    const googleSub = payload?.sub;
    const name = String(payload?.name || "").trim().slice(0, 80);
    if (!payload?.email_verified || !email || !googleSub || !name) {
      return sendError(res, 401, "Google could not verify this account's email.");
    }

    let user = await User.findOne({ $or: [{ email }, { googleSub }] }).select("+googleSub");
    let isNewUser = false;
    if (user) {
      if (user.role !== "guest") {
        return sendError(res, 403, "Administrator accounts must use administrator email and password sign-in.");
      }
      if (user.email !== email || (user.googleSub && user.googleSub !== googleSub)) {
        return sendError(res, 409, "This Google account is already linked to a different HotelNexa account.");
      }
      user.googleSub = googleSub;
      user.emailVerified = true;
      if (!user.name) user.name = name;
      await user.save();
    } else {
      user = await User.create({
        name,
        email,
        googleSub,
        role: "guest",
        emailVerified: true,
        password: "",
      });
      isNewUser = true;
    }

    await TempUser.deleteOne({ email });
    setAuthCookie(res, createToken(user));
    return res.json({
      success: true,
      message: isNewUser ? "Your Google account is ready." : "Welcome back to HotelNexa.",
      isNewUser,
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, "This Google account is already linked to a HotelNexa account.");
    if (error.message === "GOOGLE_CLIENT_ID is not configured.") {
      console.error("Google sign-in is unavailable: GOOGLE_CLIENT_ID is not configured.");
      return sendError(res, 503, "Google sign-in is not configured yet.");
    }
    console.error("Google sign-in failed:", error.message);
    return sendError(res, 401, "Google sign-in could not be verified. Please try again.");
  }
};
