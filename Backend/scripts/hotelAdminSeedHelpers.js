const crypto = require("node:crypto");

function titleCase(value) {
  return value.split("_").filter(Boolean).map((word) =>
    `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

function createHotelAccounts(hotelPaths) {
  const folderCounts = new Map();
  for (const hotelPath of hotelPaths) {
    const hotelFolder = hotelPath.split("/")[3];
    folderCounts.set(hotelFolder, (folderCounts.get(hotelFolder) || 0) + 1);
  }

  const accounts = hotelPaths.map((hotelId) => {
    const parts = hotelId.split("/");
    if (parts.length !== 4 || parts.some((part) => !/^[a-z0-9_]+$/.test(part))) {
      throw new Error(`Invalid hotel directory path: ${hotelId}`);
    }
    const hotelFolder = parts[3];
    const duplicateName = folderCounts.get(hotelFolder) > 1;
    const suffix = duplicateName
      ? `.${crypto.createHash("sha256").update(hotelId).digest("hex").slice(0, 10)}`
      : "";
    return {
      hotelId,
      name: `Hotel ${titleCase(hotelFolder.replace(/^hotel_/, ""))}`,
      email: `${hotelFolder}${suffix}@gmail.com`,
    };
  });

  const uniqueEmails = new Set(accounts.map((account) => account.email));
  if (uniqueEmails.size !== accounts.length) {
    throw new Error("Hotel administrator email generation produced a duplicate.");
  }
  return accounts;
}

module.exports = { createHotelAccounts };
