require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
const bcrypt = require("bcryptjs");
const connectDatabase = require("../SigninSignup/database");
const User = require("../SigninSignup/Models/User");
const hotelDirectoryPaths = require("../../Shared/hotelDirectoryPaths.json");
const { createHotelAccounts } = require("./hotelAdminSeedHelpers");

const DEMO_HOTEL_ADMIN_PASSWORD = "HotelNexa";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The shared-password hotel admin seeder is for local demos only and cannot run in production.");
  }
  await connectDatabase();
  const accounts = createHotelAccounts(hotelDirectoryPaths);
  const existingUsers = await User.find({ email: { $in: accounts.map((account) => account.email) } })
    .select("email role hotelId").lean();
  const existingByEmail = new Map(existingUsers.map((user) => [user.email, user]));

  const conflicts = accounts.filter((account) => {
    const existing = existingByEmail.get(account.email);
    return existing && (existing.role !== "hotelAdmin" || existing.hotelId !== account.hotelId);
  });
  if (conflicts.length) {
    throw new Error(`Cannot safely provision ${conflicts.length} account(s): an email is already assigned to another user.`);
  }

  const password = await bcrypt.hash(DEMO_HOTEL_ADMIN_PASSWORD, 12);
  let created = 0;
  for (const account of accounts) {
    const existed = existingByEmail.has(account.email);
    await User.updateOne(
      { email: account.email, role: "hotelAdmin", hotelId: account.hotelId },
      {
        $set: {
          name: account.name,
          password,
          role: "hotelAdmin",
          hotelId: account.hotelId,
          emailVerified: false,
          mustChangePassword: false,
          loginAttempts: 0,
          loginLockUntil: null,
        },
        $setOnInsert: { email: account.email },
      },
      { upsert: true, runValidators: true },
    );
    if (!existed) created += 1;
  }

  console.log(`Hotel admin provisioning complete: ${created} created, ${accounts.length - created} updated, ${accounts.length} total hotels. Shared demo password applied.`);
}

main()
  .catch((error) => {
    console.error("Hotel admin provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = require("mongoose");
    await mongoose.disconnect();
  });
