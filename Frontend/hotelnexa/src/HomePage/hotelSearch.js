function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function uniqueBy(items, key) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function locationSuggestion(hotel, type) {
  if (type === "state") {
    return { type, state: hotel.state, label: `${hotel.state}, India` };
  }
  if (type === "city") {
    return { type, state: hotel.state, city: hotel.city, label: `${hotel.city}, ${hotel.state}` };
  }
  if (type === "place") {
    return {
      type,
      state: hotel.state,
      city: hotel.city,
      place: hotel.place,
      label: `${hotel.place} · ${hotel.city}, ${hotel.state}`,
    };
  }
  return {
    type: "hotel",
    state: hotel.state,
    city: hotel.city,
    place: hotel.place,
    hotelName: hotel.hotelName,
    label: `${hotel.hotelName} · ${hotel.place}, ${hotel.city}`,
  };
}

export function getLocationSuggestions(hotels, query) {
  const search = normalize(query);
  if (!search) return [];

  const stateMatches = uniqueBy(
    hotels.filter((hotel) => normalize(hotel.state).includes(search)),
    (hotel) => hotel.state,
  );
  if (stateMatches.length) {
    const suggestions = stateMatches.map((hotel) => locationSuggestion(hotel, "state"));
    stateMatches.forEach((state) => {
      uniqueBy(
        hotels.filter((hotel) => hotel.state === state.state),
        (hotel) => hotel.city,
      ).forEach((city) => suggestions.push(locationSuggestion(city, "city")));
    });
    return suggestions.slice(0, 8);
  }

  const cityMatches = uniqueBy(
    hotels.filter((hotel) => normalize(hotel.city).includes(search)),
    (hotel) => `${hotel.state}|${hotel.city}`,
  );
  if (cityMatches.length) {
    const suggestions = cityMatches.map((hotel) => locationSuggestion(hotel, "city"));
    cityMatches.forEach((city) => {
      uniqueBy(
        hotels.filter((hotel) => hotel.state === city.state && hotel.city === city.city),
        (hotel) => hotel.place,
      ).forEach((place) => suggestions.push(locationSuggestion(place, "place")));
    });
    return suggestions.slice(0, 8);
  }

  const placeMatches = uniqueBy(
    hotels.filter((hotel) => normalize(hotel.place).includes(search)),
    (hotel) => `${hotel.state}|${hotel.city}|${hotel.place}`,
  );
  if (placeMatches.length) {
    const suggestions = placeMatches.map((hotel) => locationSuggestion(hotel, "place"));
    placeMatches.forEach((place) => {
      hotels
        .filter((hotel) => hotel.state === place.state && hotel.city === place.city && hotel.place === place.place)
        .forEach((hotel) => suggestions.push(locationSuggestion(hotel, "hotel")));
    });
    return suggestions.slice(0, 8);
  }

  return hotels
    .filter((hotel) => normalize(hotel.hotelName).includes(search))
    .slice(0, 8)
    .map((hotel) => locationSuggestion(hotel, "hotel"));
}

export function searchHotels(hotels, location) {
  if (location && typeof location === "object") {
    if (location.type === "state") return hotels.filter((hotel) => hotel.state === location.state);
    if (location.type === "city") {
      return hotels.filter((hotel) => hotel.state === location.state && hotel.city === location.city);
    }
    if (location.type === "place") {
      return hotels.filter((hotel) => hotel.state === location.state
        && hotel.city === location.city
        && hotel.place === location.place);
    }
    if (location.type === "hotel") {
      return hotels.filter((hotel) => hotel.state === location.state
        && hotel.city === location.city
        && hotel.place === location.place
        && hotel.hotelName === location.hotelName);
    }
    return [];
  }

  const search = normalize(location);
  if (!search) return [];

  const matchingStates = new Set(hotels
    .filter((hotel) => normalize(hotel.state).includes(search))
    .map((hotel) => hotel.state));
  if (matchingStates.size) return hotels.filter((hotel) => matchingStates.has(hotel.state));

  const matchingCities = new Set(hotels
    .filter((hotel) => normalize(hotel.city).includes(search))
    .map((hotel) => `${hotel.state}|${hotel.city}`));
  if (matchingCities.size) {
    return hotels.filter((hotel) => matchingCities.has(`${hotel.state}|${hotel.city}`));
  }

  const matchingPlaces = new Set(hotels
    .filter((hotel) => normalize(hotel.place).includes(search))
    .map((hotel) => `${hotel.state}|${hotel.city}|${hotel.place}`));
  if (matchingPlaces.size) {
    return hotels.filter((hotel) => matchingPlaces.has(`${hotel.state}|${hotel.city}|${hotel.place}`));
  }

  return hotels.filter((hotel) => normalize(hotel.hotelName).includes(search));
}
