const path = require("node:path");
const hotelDirectoryPaths = require(path.join(__dirname, "../../../Shared/hotelDirectoryPaths.json"));
const ReservationNight = require("../Models/ReservationNight");
const Room = require("../Models/Room");
const RoomType = require("../Models/RoomType");
const { getTrustedAdvanceAmount, getTrustedNightlyRate } = require("./hotelPricing");
const { getStayDates, requiredBedCount, validateReservationInput } = require("./reservationValidation");

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const maximumBudget = 50_000;
const allowedFeatures = {
  offers: ["Breakfast included", "Free cancellation", "Pay at the property"],
  facilities: ["Free Wi-Fi", "Swimming pool"],
  amenities: ["Air conditioning", "Heating", "Television", "Refrigerator", "Balcony"],
};

function stableSeed(value) {
  let seed = 2_166_136_261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

function titleCase(value) {
  return value.split("_").filter(Boolean).map((word) =>
    `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

const hotelCatalog = [...hotelDirectoryPaths].sort().map((id, listingIndex) => {
  const [stateKey, cityKey, placeKey, hotelKey] = id.split("/");
  const seed = stableSeed(id);
  const amenities = {
    wifi: true,
    breakfast: listingIndex % 5 !== 0,
    pool: listingIndex % 2 === 0,
    freeCancellation: true,
    payAtProperty: true,
    airConditioning: seed % 5 !== 1,
    heating: seed % 4 !== 1,
    television: seed % 5 !== 2,
    refrigerator: seed % 3 !== 1,
    balcony: seed % 3 === 0,
  };
  return {
    id,
    state: titleCase(stateKey),
    city: titleCase(cityKey),
    place: titleCase(placeKey),
    hotelName: `Hotel ${titleCase(hotelKey.replace(/^hotel_/, ""))}`,
    stars: 3 + (seed % 3),
    distanceKm: Number((0.2 + ((seed % 38) / 10)).toFixed(1)),
    amenities,
  };
});

function normalize(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const error = new Error("The AI concierge is not configured. Add GEMINI_API_KEY to the backend environment.");
    error.status = 503;
    throw error;
  }
  return key;
}

async function callGemini(contents, functionDeclaration, functionName) {
  const apiKey = getGeminiKey();
  let response;
  try {
    response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: contents.flatMap((content) => content.parts || [])
          .map((part) => part.text)
          .filter(Boolean)
          .join("\n"),
        tools: [{ type: "function", ...functionDeclaration }],
        generation_config: {
          tool_choice: "any",
          thinking_level: "low",
        },
        store: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    const error = new Error(cause.name === "TimeoutError"
      ? "The AI concierge took too long to respond. Please try again."
      : "Could not connect to the AI concierge. Please try again.");
    error.status = cause.name === "TimeoutError" ? 504 : 502;
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(response.status === 429
      ? "The AI concierge is busy. Please try again in a moment."
      : "Gemini could not process this request. Please try again.");
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  const call = payload?.steps?.find((step) => (
    step.type === "function_call" && step.name === functionName
  ));
  if (!call?.arguments || typeof call.arguments !== "object") {
    const error = new Error("The AI concierge could not understand that request. Please rephrase it.");
    error.status = 502;
    throw error;
  }
  return call.arguments;
}

function extractPreferencesDeclaration() {
  return {
    name: "extract_hotel_search_preferences",
    description: "Extract booking preferences from the guest's message. Never invent locations or hotel names.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City or destination explicitly requested." },
        area: { type: "string", description: "Neighborhood, landmark, or place explicitly requested." },
        hotelName: { type: "string", description: "Specific hotel name explicitly requested." },
        guestCount: { type: "integer", description: "Number of guests if stated." },
        bedCount: { type: "integer", description: "Number of beds if stated." },
        maxBudget: { type: "integer", description: "Maximum budget per night in INR if stated." },
      },
    },
  };
}

async function interpretConciergeMessage(message) {
  if (typeof message !== "string" || !message.trim() || message.length > 500) {
    const error = new Error("Enter a request of up to 500 characters.");
    error.status = 400;
    throw error;
  }
  const args = await callGemini([{
    role: "user",
    parts: [{
      text: `Extract only booking preferences explicitly stated by the guest. The directory is limited to HotelNexa's Indian city/place/hotel directory. Do not infer guest count, beds, budget, or locations. If a number is ambiguous, omit it. Message: ${message.trim()}`,
    }],
  }], extractPreferencesDeclaration(), "extract_hotel_search_preferences");

  const preference = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
  const number = (value, minimum, maximum) => (
    Number.isInteger(value) && value >= minimum && value <= maximum ? value : null
  );
  return {
    city: preference(args.city, 80),
    area: preference(args.area, 100),
    hotelName: preference(args.hotelName, 100),
    guestCount: number(args.guestCount, 1, 4),
    bedCount: number(args.bedCount, 1, 4),
    maxBudget: number(args.maxBudget, 1, maximumBudget),
  };
}

function validateSearchCriteria(input) {
  const criteria = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const city = typeof criteria.city === "string" ? criteria.city.trim().slice(0, 80) : "";
  const area = typeof criteria.area === "string" ? criteria.area.trim().slice(0, 100) : "";
  const hotelName = typeof criteria.hotelName === "string" ? criteria.hotelName.trim().slice(0, 100) : "";
  if (!city && !hotelName) {
    const error = new Error("Enter a city or hotel name to search.");
    error.status = 400;
    throw error;
  }
  const adults = Number(criteria.adults ?? criteria.guestCount);
  if (criteria.childAges !== undefined && !Array.isArray(criteria.childAges)) {
    const error = new Error("Choose valid child ages and guest counts.");
    error.status = 400;
    throw error;
  }
  const childAges = Array.isArray(criteria.childAges) ? criteria.childAges : [];
  const guestCount = adults + childAges.length;
  const bedCount = requiredBedCount(adults, childAges);
  if (Number.isInteger(criteria.bedCount) && criteria.bedCount !== bedCount) {
    const error = new Error("The requested bed count does not match the adults and children selected.");
    error.status = 400;
    throw error;
  }
  const maxBudget = Number(criteria.maxBudget);
  const validation = validateReservationInput({
    hotelId: hotelCatalog[0].id,
    checkIn: criteria.checkIn,
    checkOut: criteria.checkOut,
    adults,
    childAges,
    bedCount,
  });
  if (validation.error) {
    const error = new Error(validation.error);
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(maxBudget) || maxBudget < 1 || maxBudget > maximumBudget) {
    const error = new Error(`Set a nightly budget between ₹1 and ₹${maximumBudget.toLocaleString("en-IN")}.`);
    error.status = 400;
    throw error;
  }
  const filters = criteria.filters && typeof criteria.filters === "object" && !Array.isArray(criteria.filters)
    ? criteria.filters
    : {};
  const starRatings = Array.isArray(filters.starRatings)
    ? [...new Set(filters.starRatings.filter((value) => [2, 3, 4, 5].includes(value)))].slice(0, 4)
    : [];
  const features = {};
  for (const [group, options] of Object.entries(allowedFeatures)) {
    const selected = Array.isArray(filters[group]) ? filters[group] : [];
    features[group] = [...new Set(selected.filter((value) => options.includes(value)))];
  }
  const distanceKm = [1, 5, 10].includes(filters.distanceKm) ? filters.distanceKm : null;
  const additionalRequirements = typeof criteria.additionalRequirements === "string"
    ? criteria.additionalRequirements.trim().slice(0, 240)
    : "";
  return {
    city,
    area,
    hotelName,
    adults,
    childAges,
    guestCount,
    bedCount,
    maxBudget,
    checkIn: criteria.checkIn,
    checkOut: criteria.checkOut,
    nights: validation.nights,
    filters: { starRatings, ...features, distanceKm },
    additionalRequirements,
  };
}

function searchDeclaration() {
  return {
    name: "search_available_hotels",
    description: "Search HotelNexa's current hotel catalog for available hotels matching the guest's exact room and stay requirements.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        area: { type: "string" },
        hotelName: { type: "string" },
        checkIn: { type: "string", description: "YYYY-MM-DD" },
        checkOut: { type: "string", description: "YYYY-MM-DD" },
        adults: { type: "integer" },
        childAges: { type: "array", items: { type: "integer" } },
        guestCount: { type: "integer" },
        bedCount: { type: "integer" },
        maxBudget: { type: "integer", description: "INR per night" },
        additionalRequirements: { type: "string" },
      },
      required: ["city", "checkIn", "checkOut", "guestCount", "bedCount", "maxBudget"],
    },
  };
}

function getSelectedFeatures(hotel, filters) {
  return [
    ...filters.offers.map((label) => ({
      label,
      matched: label === "Breakfast included" ? hotel.amenities.breakfast
        : label === "Free cancellation" ? hotel.amenities.freeCancellation
          : hotel.amenities.payAtProperty,
    })),
    ...filters.facilities.map((label) => ({
      label,
      matched: label === "Free Wi-Fi" ? hotel.amenities.wifi : hotel.amenities.pool,
    })),
    ...filters.amenities.map((label) => ({
      label,
      matched: hotel.amenities[{
        "Air conditioning": "airConditioning",
        Heating: "heating",
        Television: "television",
        Refrigerator: "refrigerator",
        Balcony: "balcony",
      }[label]],
    })),
  ];
}

function searchCandidates(criteria, unavailable, {
  relaxLocation = false,
  includeUnavailable = false,
  includeOverBudget = false,
  pricingByHotel = new Map(),
} = {}) {
  const cityQuery = normalize(criteria.city);
  const areaQuery = normalize(criteria.area);
  const hotelQuery = normalize(criteria.hotelName);
  const terms = criteria.additionalRequirements.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  return hotelCatalog.filter((hotel) => {
    const locationMatched = (!cityQuery || normalize(hotel.city).includes(cityQuery))
      && (relaxLocation || !areaQuery || normalize(hotel.place).includes(areaQuery))
      && (relaxLocation || !hotelQuery || normalize(hotel.hotelName).includes(hotelQuery));
    if (!locationMatched || (!includeUnavailable && unavailable.has(hotel.id))) return false;
    const pricing = pricingByHotel.get(hotel.id)?.[0];
    const nightlyRate = pricing?.nightlyRate ?? getTrustedNightlyRate(hotel.id, criteria.bedCount);
    return includeOverBudget || nightlyRate <= criteria.maxBudget;
  }).map((hotel) => {
    const pricing = pricingByHotel.get(hotel.id)?.[0];
    const nightlyRate = pricing?.nightlyRate ?? getTrustedNightlyRate(hotel.id, criteria.bedCount);
    const features = getSelectedFeatures(hotel, criteria.filters);
    const starMatched = !criteria.filters.starRatings.length
      || criteria.filters.starRatings.includes(hotel.stars);
    const distanceMatched = criteria.filters.distanceKm === null
      || hotel.distanceKm <= criteria.filters.distanceKm;
    const customMatched = terms.every((term) => normalize(
      `${hotel.hotelName} ${hotel.city} ${hotel.place} ${Object.keys(hotel.amenities).filter((key) => hotel.amenities[key]).join(" ")}`,
    ).includes(term));
    const requestedLocationMissing = relaxLocation
      && ((areaQuery && !normalize(hotel.place).includes(areaQuery))
        || (hotelQuery && !normalize(hotel.hotelName).includes(hotelQuery)));
    const missing = [
      ...(requestedLocationMissing
        ? [criteria.area ? `Requested area: ${criteria.area}` : `Requested hotel: ${criteria.hotelName}`]
        : []),
      ...(!starMatched ? [`${criteria.filters.starRatings.join("/")} star rating`] : []),
      ...features.filter((feature) => !feature.matched).map((feature) => feature.label),
      ...(!distanceMatched ? [`Under ${criteria.filters.distanceKm} km from the centre`] : []),
      ...(!customMatched && criteria.additionalRequirements ? [criteria.additionalRequirements] : []),
      ...(nightlyRate > criteria.maxBudget
        ? [`Over budget: ₹${nightlyRate.toLocaleString("en-IN")} per night`]
        : []),
      ...(unavailable.has(hotel.id) ? ["Already booked for these dates"] : []),
    ];
    const score = Number(starMatched) + Number(distanceMatched) + Number(customMatched)
      + features.filter((feature) => feature.matched).length;
    const matched = features.filter((feature) => feature.matched).map((feature) => feature.label);
    if (criteria.filters.starRatings.length && starMatched) {
      matched.push(`${hotel.stars} star rating`);
    }
    if (criteria.filters.distanceKm !== null && distanceMatched) {
      matched.push(`Under ${criteria.filters.distanceKm} km from the centre`);
    }
    return {
      id: hotel.id,
      hotelName: hotel.hotelName,
      state: hotel.state,
      city: hotel.city,
      place: hotel.place,
      stars: hotel.stars,
      distanceKm: hotel.distanceKm,
      bedCount: criteria.bedCount,
      guestCount: criteria.guestCount,
      adults: criteria.adults,
      childAges: criteria.childAges,
      nightlyRate,
      total: nightlyRate * criteria.nights,
      advanceAmount: Math.min(
        pricing?.advanceAmount ?? getTrustedAdvanceAmount(hotel.id, criteria.bedCount, nightlyRate * criteria.nights),
        nightlyRate * criteria.nights,
      ),
      roomTypeId: pricing?.roomTypeId || "",
      nights: criteria.nights,
      checkIn: criteria.checkIn,
      checkOut: criteria.checkOut,
      matched,
      missing,
      score,
      locationMatched: !requestedLocationMissing,
      available: !unavailable.has(hotel.id),
    };
  });
}

function getRankedSearchCandidates(criteria, unavailable, pricingByHotel = new Map()) {
  const localCandidates = searchCandidates(criteria, unavailable, { pricingByHotel });
  const cityQuery = normalize(criteria.city);
  const hotelQuery = normalize(criteria.hotelName);
  if (hotelQuery) {
    const requestedHotels = hotelCatalog.filter((hotel) => (
      (!cityQuery || normalize(hotel.city).includes(cityQuery))
      && normalize(hotel.hotelName).includes(hotelQuery)
    ));
    if (requestedHotels.length) {
      const requestedIds = new Set(requestedHotels.map((hotel) => hotel.id));
      const requestedCityNames = new Set(requestedHotels.map((hotel) => normalize(hotel.city)));
      const requestedCandidates = searchCandidates(criteria, unavailable, {
        relaxLocation: true,
        includeUnavailable: true,
        includeOverBudget: true,
        pricingByHotel,
      }).filter((hotel) => requestedIds.has(hotel.id));
      const alternatives = searchCandidates(criteria, unavailable, { relaxLocation: true, pricingByHotel })
        .filter((hotel) => requestedCityNames.has(normalize(hotel.city)) && !requestedIds.has(hotel.id))
        .sort((left, right) => left.distanceKm - right.distanceKm
          || left.nightlyRate - right.nightlyRate);
      return {
        candidates: [...requestedCandidates, ...alternatives],
        exactMatch: false,
        nearbyFallback: alternatives.length > 0,
        requestedHotel: requestedCandidates[0]?.hotelName || requestedHotels[0].hotelName,
        requestedHotelUnavailable: requestedCandidates[0]?.available === false,
      };
    }
  }

  const exact = localCandidates.filter((hotel) => hotel.missing.length === 0);
  if (exact.length) {
    return {
      candidates: exact.sort((left, right) => left.nightlyRate - right.nightlyRate),
      exactMatch: true,
      nearbyFallback: false,
    };
  }

  const requestedHotels = hotelCatalog.filter((hotel) => (
    (!cityQuery || normalize(hotel.city).includes(cityQuery))
    && (!hotelQuery || normalize(hotel.hotelName).includes(hotelQuery))
  ));
  const cityNames = cityQuery
    ? new Set([normalize(requestedHotels[0]?.city || criteria.city)])
    : new Set(requestedHotels.map((hotel) => normalize(hotel.city)));
  const nearbyInventory = cityNames.size === 1
    ? hotelCatalog.filter((hotel) => cityNames.has(normalize(hotel.city)))
    : [];
  const canExpandLocation = nearbyInventory.some((hotel) => (
    !localCandidates.some((candidate) => candidate.id === hotel.id)
  ));
  if (!canExpandLocation) {
    return { candidates: localCandidates, exactMatch: false, nearbyFallback: false };
  }

  const allCandidates = searchCandidates(criteria, unavailable, { relaxLocation: true, pricingByHotel });
  const candidatesById = new Map([
    ...localCandidates.map((hotel) => [hotel.id, hotel]),
    ...allCandidates.map((hotel) => [hotel.id, hotel]),
  ]);
  const candidates = [...candidatesById.values()].sort((left, right) => (
    right.score - left.score
    || Number(right.locationMatched) - Number(left.locationMatched)
    || left.distanceKm - right.distanceKm
    || left.nightlyRate - right.nightlyRate
  ));
  return {
    candidates,
    exactMatch: false,
    nearbyFallback: allCandidates.some((hotel) => !hotel.locationMatched),
  };
}

async function searchAvailableHotels(input) {
  const criteria = validateSearchCriteria(input);
  await callGemini([{
    role: "user",
    parts: [{
      text: `Call search_available_hotels for this guest's validated criteria. Do not change any field. The server will enforce room availability, bed count, dates, budget, and filters. Criteria: ${JSON.stringify(criteria)}`,
    }],
  }], searchDeclaration(), "search_available_hotels");

  const stayDates = getStayDates(criteria.checkIn, criteria.nights);
  const matchingLocationIds = hotelCatalog.filter((hotel) => (
    (!normalize(criteria.city) || normalize(hotel.city).includes(normalize(criteria.city)))
    && (!normalize(criteria.area) || normalize(hotel.place).includes(normalize(criteria.area)))
    && (!normalize(criteria.hotelName) || normalize(hotel.hotelName).includes(normalize(criteria.hotelName)))
  )).map((hotel) => hotel.id);
  const matchingHotels = hotelCatalog.filter((hotel) => matchingLocationIds.includes(hotel.id));
  const nearbyCities = criteria.city
    ? new Set([normalize(criteria.city)])
    : new Set(matchingHotels.map((hotel) => normalize(hotel.city)));
  const nearbyLocationIds = nearbyCities.size === 1
    ? hotelCatalog.filter((hotel) => nearbyCities.has(normalize(hotel.city))).map((hotel) => hotel.id)
    : matchingLocationIds;
  const roomTypes = nearbyLocationIds.length
    ? await RoomType.find({
      hotelId: { $in: nearbyLocationIds },
      bedCount: criteria.bedCount,
      capacity: { $gte: criteria.guestCount },
      isActive: true,
    }).select("_id hotelId nightlyRate advanceAmount").lean()
    : [];
  const roomTypeIds = roomTypes.map((roomType) => roomType._id);
  const rooms = roomTypeIds.length
    ? await Room.find({
      hotelId: { $in: nearbyLocationIds },
      roomTypeId: { $in: roomTypeIds },
      status: { $in: ["Available", "Occupied"] },
    }).select("_id hotelId roomTypeId").lean()
    : [];
  const roomIds = rooms.map((room) => room._id);
  const roomNights = roomIds.length
    ? await ReservationNight.find({
      roomId: { $in: roomIds },
      stayDate: { $in: stayDates },
      isReleased: { $ne: true },
      $or: [
        { expiresAt: null },
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } },
      ],
    }).select("roomId stayDate").lean()
    : [];
  const occupied = new Set(roomNights.map((lock) =>
    `${String(lock.roomId)}|${lock.stayDate.toISOString().slice(0, 10)}`));
  const pricingByHotel = new Map();
  const unavailable = new Set();
  for (const hotelId of nearbyLocationIds) {
    const hotelRooms = rooms.filter((room) => room.hotelId === hotelId);
    const availableRooms = hotelRooms.filter((room) => stayDates.every((date) =>
      !occupied.has(`${String(room._id)}|${date.toISOString().slice(0, 10)}`)));
    if (!availableRooms.length) {
      unavailable.add(hotelId);
    }
    const availableTypeIds = new Set(availableRooms.map((room) => String(room.roomTypeId)));
    const typesForPricing = roomTypes.filter((roomType) => roomType.hotelId === hotelId
      && (!availableRooms.length || availableTypeIds.has(String(roomType._id))));
    pricingByHotel.set(hotelId, typesForPricing.map((roomType) => ({
      roomTypeId: String(roomType._id),
      nightlyRate: roomType.nightlyRate,
      advanceAmount: roomType.advanceAmount,
    })).sort((left, right) => left.nightlyRate - right.nightlyRate));
  }

  const requestedLocationUnavailable = matchingLocationIds.length > 0
    && matchingLocationIds.every((hotelId) => unavailable.has(hotelId));
  const {
    candidates,
    exactMatch,
    nearbyFallback,
    requestedHotel,
    requestedHotelUnavailable,
  } = getRankedSearchCandidates(criteria, unavailable, pricingByHotel);
  const hotels = candidates.slice(0, 8);
  const requestedLocation = criteria.area || criteria.hotelName;
  const nearbyCity = hotels.find((hotel) => !hotel.locationMatched)?.city || hotels[0]?.city || criteria.city;
  const stayDatesLabel = `${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${criteria.checkIn}T00:00:00.000Z`))} to ${new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${criteria.checkOut}T00:00:00.000Z`))}`;
  const unavailableMessage = `${requestedLocation || criteria.city}'s ${criteria.bedCount}-bed room${criteria.bedCount === 1 ? "" : "s"} are already booked from ${stayDatesLabel}.`;
  return {
    exactMatch,
    nearbyFallback,
    requestedHotel,
    requestedHotelUnavailable,
    requestedLocationUnavailable,
    total: candidates.length,
    hotels,
    demoInventory: true,
    message: requestedHotel
      ? requestedHotelUnavailable
        ? `${requestedHotel} is already booked for these dates and is shown first for reference. ${candidates.slice(1).some((hotel) => hotel.available)
          ? "Available alternatives follow, sorted by approximate distance to the city centre."
          : "No available alternatives meet the selected dates, bed count, and budget."}`
        : `${requestedHotel} is shown first, followed by available hotels sorted by approximate distance to the city centre.`
      : exactMatch
      ? `I found ${candidates.length} available ${candidates.length === 1 ? "stay" : "stays"} matching all your selected requirements.`
      : nearbyFallback && candidates.length
        ? `${requestedLocationUnavailable ? `${unavailableMessage} ` : `No exact match is available in ${requestedLocation || criteria.city}. `}Here are nearby options in ${nearbyCity}, ranked by preferences met and approximate distance to the city centre. Dates, bed count, and budget match. Distances are illustrative.`
        : candidates.length
          ? `${requestedLocationUnavailable ? `${unavailableMessage} ` : ""}No hotels matched all your exact preferences, but here are available options that fulfill the most requirements:`
          : nearbyFallback
            ? `${requestedLocationUnavailable ? `${unavailableMessage} ` : ""}I couldn't find a nearby stay for these dates, bed count, and budget. Choose different dates or adjust your search.`
            : `${requestedLocationUnavailable ? `${unavailableMessage} ` : ""}I couldn't find an available stay matching the selected city, dates, bed count, and budget. Try different dates, another area, or a higher budget.`,
  };
}

module.exports = {
  interpretConciergeMessage,
  getRankedSearchCandidates,
  searchCandidates,
  searchAvailableHotels,
  validateSearchCriteria,
  requiredBedCount,
  hotelCatalog,
};
