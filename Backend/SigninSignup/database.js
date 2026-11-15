const mongoose = require("mongoose");
const User = require("./Models/User");

async function removeLegacyPhoneIndex() {
  let indexes;
  try {
    indexes = await User.collection.indexes();
  } catch (error) {
    if (error.code === 26) return;
    throw error;
  }
  for (const index of indexes.filter((entry) => entry.key?.phone === 1)) {
    await User.collection.dropIndex(index.name);
  }
}

async function connectDatabase() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
  await mongoose.connect(process.env.MONGO_URI);
  await removeLegacyPhoneIndex();
  console.log("MongoDB connected.");
}

module.exports = connectDatabase;