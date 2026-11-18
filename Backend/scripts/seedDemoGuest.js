require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
const bcrypt = require("bcryptjs");
const connectDatabase = require("../SigninSignup/database");
const User = require("../SigninSignup/Models/User");

const DEMO_GUEST_EMAIL = "demo.guest@hotelnexa.test";
const DEMO_GUEST_PASSWORD = "NexaGuest2026!";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The shared-password demo guest seeder is for local demos only and cannot run in production.");
  }

  await connectDatabase();
  const existing = await User.findOne({ email: DEMO_GUEST_EMAIL }).select("role").lean();
  if (existing && existing.role !== "guest") {
    throw new Error("Cannot safely provision the demo guest: the email belongs to a non-guest account.");
  }

  const password = await bcrypt.hash(DEMO_GUEST_PASSWORD, 12);
  await User.updateOne(
    { email: DEMO_GUEST_EMAIL, role: "guest" },
    {
      $set: {
        name: "HotelNexa Demo Guest",
        phone: "",
        password,
        role: "guest",
        hotelId: "",
        emailVerified: true,
        loginAttempts: 0,
        loginLockUntil: null,
      },
      $setOnInsert: { email: DEMO_GUEST_EMAIL },
    },
    { upsert: true, runValidators: true },
  );
  console.log("Local demo guest provisioned. Do not use this shared credential in production.");
}

main()
  .catch((error) => {
    console.error("Demo guest provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = require("mongoose");
    await mongoose.disconnect();
  });
