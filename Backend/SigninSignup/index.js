require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const connectDatabase = require("./database");
const Reservation = require("./Models/Reservation");
const ReservationNight = require("./Models/ReservationNight");
const Room = require("./Models/Room");
const RoomType = require("./Models/RoomType");
const AuditLog = require("./Models/AuditLog");
const authRoutes = require("./Routes/authRoutes");
const reservationRoutes = require("./Routes/reservationRoutes");
const aiRoutes = require("./Routes/aiRoutes");
const { startPendingCancellationReconciliation } = require("./Controllers/reservationController");
const { corsOrigin, validateFrontendOrigins } = require("./corsConfig");
const { validateDeploymentConfig } = require("./deploymentConfig");
const { initializeAiConciergeRateLimiter } = require("./Services/aiConciergeRateLimiter");

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "20kb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/ai", aiRoutes);
app.use((error, _req, res, _next) => {
  const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
  const message = status === 413
    ? "Request body is too large."
    : status === 400
      ? "Request body must contain valid JSON."
      : "The request could not be completed.";
  if (status === 500) console.error("Unhandled API error:", error.message);
  return res.status(status).json({ success: false, message });
});

async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be a random value of at least 32 characters.");
  }
  validateDeploymentConfig();
  validateFrontendOrigins();
  await initializeAiConciergeRateLimiter();
  await connectDatabase();
  await Promise.all([
    Reservation.init(),
    ReservationNight.init(),
    Room.init(),
    RoomType.init(),
    AuditLog.init(),
  ]);
  const checkedInRoomIds = await Reservation.distinct("roomId", {
    status: "CheckedIn",
    roomId: { $ne: null },
  });
  await Room.updateMany({ _id: { $in: checkedInRoomIds } }, { $set: { status: "Occupied" } });
  await Room.updateMany({
    status: "Occupied",
    _id: { $nin: checkedInRoomIds },
  }, { $set: { status: "Available" } });
  startPendingCancellationReconciliation();
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => console.log(`HotelNexa API listening on port ${port}.`));
}

startServer().catch((error) => {
  console.error("HotelNexa API could not start:", error.message);
  process.exitCode = 1;
});