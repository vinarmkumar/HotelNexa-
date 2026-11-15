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

export function createHotelPresentation(hotel, listingIndex) {
  const seed = stableSeed(hotel.id);
  const prices = Object.fromEntries(
    Object.entries(roomPriceRanges).map(([bedCount, range]) => {
      const from = valueInRange(seed + Number(bedCount) * 733, range.min, range.max - 500);
      const to = valueInRange(seed + Number(bedCount) * 1_301, from, range.max);
      const advance = Math.min(from - 1, range.advance + (seed % 401));
      return [bedCount, { from, to, advance }];
    }),
  );
  const allPrices = Object.values(prices);
  const rating = (3.8 + ((seed % 12) / 10)).toFixed(1);
  const distance = (0.2 + ((seed % 38) / 10)).toFixed(1);

  return {
    rating,
    ratingLabel: Number(rating) >= 4.5 ? "Excellent" : Number(rating) >= 4.1 ? "Very good" : "Good",
    stars: 3 + (seed % 3),
    distanceKm: distance,
    prices,
    lowestPrice: Math.min(...allPrices.map((price) => price.from)),
    highestPrice: Math.max(...allPrices.map((price) => price.to)),
    amenities: {
      wifi: true,
      breakfast: listingIndex % 5 !== 0,
      pool: listingIndex % 2 === 0,
      coupleFriendly: listingIndex % 5 < 3,
      familyFriendly: true,
      freeCancellation: true,
      payAtProperty: true,
      carPark: seed % 3 !== 0,
      restaurant: seed % 4 !== 0,
      nonSmoking: seed % 5 !== 0,
      petsAllowed: seed % 6 === 0,
      airConditioning: seed % 5 !== 1,
      heating: seed % 4 !== 1,
      television: seed % 5 !== 2,
      refrigerator: seed % 3 !== 1,
      privateBathroom: true,
      workspace: seed % 4 !== 2,
      balcony: seed % 3 === 0,
    },
  };
}

export function createHotelDirectoryPresentation(hotels) {
  return hotels.map((hotel, listingIndex) => ({
    ...hotel,
    presentation: createHotelPresentation(hotel, listingIndex),
  }));
}

export function filterHotelListings(hotels, bedCount, selectedFilters, minimumBudget, maximumBudget) {
  return hotels.filter((hotel) => {
    const presentation = hotel.presentation;
    const selectedRating = Number(String(selectedFilters.rating || "").match(/\d+/)?.[0] || 0);
    if (selectedRating && presentation.stars < selectedRating) return false;

    const selectedDistance = selectedFilters.distance;
    if (selectedDistance) {
      const maxDistance = Number(String(selectedDistance).match(/\d+/)?.[0]);
      if (Number(presentation.distanceKm) > maxDistance) return false;
    }

    const price = presentation.prices[bedCount] || presentation.prices[1];
    if (price.from > maximumBudget || price.to < minimumBudget) return false;

    const optionFeatures = {
      "offers:Breakfast included": "breakfast",
      "offers:Free cancellation": "freeCancellation",
      "offers:Pay at the property": "payAtProperty",
      "facilities:Free Wi-Fi": "wifi",
      "facilities:Swimming pool": "pool",
      "facilities:Car park": "carPark",
      "facilities:Restaurant": "restaurant",
      "facilities:Family friendly": "familyFriendly",
      "facilities:Non-smoking": "nonSmoking",
      "facilities:Pets allowed": "petsAllowed",
      "amenities:Air conditioning": "airConditioning",
      "amenities:Heating": "heating",
      "amenities:Television": "television",
      "amenities:Refrigerator": "refrigerator",
      "amenities:Private bathroom": "privateBathroom",
      "amenities:Workspace": "workspace",
      "amenities:Balcony": "balcony",
    };

    return Object.entries(optionFeatures).every(([filterKey, featureKey]) => (
      !selectedFilters[filterKey] || presentation.amenities[featureKey]
    ));
  });
}
