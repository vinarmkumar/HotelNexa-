const path = require("node:path");
const hotelDirectoryPaths = require(path.join(__dirname, "../../../Shared/hotelDirectoryPaths.json"));

const hotelIds = new Set(hotelDirectoryPaths);
const roomPriceRanges = {
  1: { min: 501, max: 2_000, advance: 500 },
  2: { min: 1_200, max: 5_000, advance: 800 },
  3: { min: 1_800, max: 6_000, advance: 1_200 },
  4: { min: 2_200, max: 7_500, advance: 1_800 },
};

function stableSeed(value) {
  let seed = 2_166_136_261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

function valueInRange(seed, min, max) {
  return min + (seed % (max - min + 1));
}

function getTrustedNightlyRate(hotelId, bedCount) {
  if (!hotelIds.has(hotelId)) {
    const error = new Error("The selected hotel is not available for booking.");
    error.status = 404;
    throw error;
  }
  const range = roomPriceRanges[bedCount];
  if (!range) {
    const error = new Error("Select a valid room type.");
    error.status = 400;
    throw error;
  }

  const seed = stableSeed(hotelId);
  return valueInRange(seed + bedCount * 733, range.min, range.max - 500);
}

function getTrustedAdvanceAmount(hotelId, bedCount, totalAmount) {
  if (!hotelIds.has(hotelId)) {
    const error = new Error("The selected hotel is not available for booking.");
    error.status = 404;
    throw error;
  }
  const range = roomPriceRanges[bedCount];
  if (!range) {
    const error = new Error("Select a valid room type.");
    error.status = 400;
    throw error;
  }
  const seed = stableSeed(hotelId);
  const nightlyRate = getTrustedNightlyRate(hotelId, bedCount);
  return Math.min(totalAmount, nightlyRate - 1, range.advance + (seed % 401));
}

function getReservationPaymentAmounts(reservation) {
  const totalAmount = reservation.totalAmount ?? reservation.amount;
  const amountDueNow = reservation.amountDueNow ?? reservation.amount;
  const amountPaid = reservation.amountPaid ?? (
    reservation.paymentStatus === "Success" ? amountDueNow : 0
  );
  const balanceDue = reservation.balanceDue ?? Math.max(0, totalAmount - amountPaid);
  return { totalAmount, amountDueNow, amountPaid, balanceDue };
}

module.exports = {
  getReservationPaymentAmounts,
  getTrustedAdvanceAmount,
  getTrustedNightlyRate,
  hotelIds,
};
