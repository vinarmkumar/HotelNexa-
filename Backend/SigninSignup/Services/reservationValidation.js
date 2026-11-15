const MAX_GUESTS = 20;
const MAX_CHILDREN = 6;
const MAX_NIGHTS = 30;

function getTodayInIndia() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getFreeCancellationEligibility(checkIn, today = getTodayInIndia()) {
  if (!isDateOnly(checkIn) || !isDateOnly(today)) {
    return { allowed: false, freeCancellationUntil: null };
  }
  const freeCancellationUntil = new Date(Date.parse(`${checkIn}T00:00:00.000Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    allowed: today <= freeCancellationUntil,
    freeCancellationUntil,
  };
}

function requiredBedCount(adults, childAges) {
  const olderChildren = childAges.filter((age) => age >= 10).length;
  const youngerChildren = childAges.filter((age) => age < 10).length;
  return adults + olderChildren + Math.max(0, youngerChildren - 1);
}

function validateReservationInput(body) {
  const { hotelId, checkIn, checkOut, adults, childAges, bedCount } = body || {};
  if (typeof hotelId !== "string" || hotelId.length > 200) {
    return { error: "Select a valid hotel." };
  }
  if (!isDateOnly(checkIn) || !isDateOnly(checkOut) || checkIn < getTodayInIndia() || checkOut <= checkIn) {
    return { error: "Choose valid future check-in and check-out dates." };
  }

  const nights = (Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`)) / 86_400_000;
  if (nights > MAX_NIGHTS) return { error: `A stay can be at most ${MAX_NIGHTS} nights.` };
  if (!Number.isInteger(adults) || adults < 1 || adults > MAX_GUESTS) {
    return { error: "Choose a valid number of adults." };
  }
  if (!Array.isArray(childAges) || childAges.length > MAX_CHILDREN
    || childAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)
    || adults + childAges.length > MAX_GUESTS) {
    return { error: "Choose valid child ages and guest counts." };
  }
  if (!Number.isInteger(bedCount) || bedCount < 1 || bedCount > 4
    || requiredBedCount(adults, childAges) !== bedCount) {
    return { error: "Choose a room that matches your guest and bed requirements." };
  }

  return { nights };
}

function getStayDates(checkIn, nights) {
  const dates = [];
  const date = new Date(`${checkIn}T00:00:00.000Z`);
  for (let index = 0; index < nights; index += 1) {
    dates.push(new Date(date.getTime() + index * 86_400_000));
  }
  return dates;
}

module.exports = {
  getTodayInIndia,
  getStayDates,
  getFreeCancellationEligibility,
  isDateOnly,
  requiredBedCount,
  validateReservationInput,
};
