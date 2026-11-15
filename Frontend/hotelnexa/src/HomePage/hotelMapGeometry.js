function stableSeed(value) {
  let seed = 2_166_136_261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

export function calculateDistanceKm(origin, destination) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6_371;
  const latitudeDifference = radians(destination.latitude - origin.latitude);
  const longitudeDifference = radians(destination.longitude - origin.longitude);
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(origin.latitude))
    * Math.cos(radians(destination.latitude))
    * Math.sin(longitudeDifference / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function createApproximateHotelCoordinate(anchor, hotelId) {
  const seed = stableSeed(hotelId);
  const angle = ((seed % 3600) / 10) * (Math.PI / 180);
  const distanceKm = 0.2 + ((seed >>> 8) % 18) / 10;
  const latitudeOffset = (distanceKm * Math.cos(angle)) / 111.32;
  const longitudeScale = 111.32 * Math.cos((anchor.latitude * Math.PI) / 180);
  const longitudeOffset = longitudeScale === 0 ? 0 : (distanceKm * Math.sin(angle)) / longitudeScale;
  return {
    latitude: anchor.latitude + latitudeOffset,
    longitude: anchor.longitude + longitudeOffset,
  };
}

export function getApproximateHotelMapLocations(hotels, anchors, destination) {
  return hotels.map((hotel) => {
    const anchor = anchors.get(`${hotel.state}/${hotel.city}/${hotel.place}`)
      || anchors.get(`${hotel.state}/${hotel.city}`)
      || destination;
    const coordinate = createApproximateHotelCoordinate(anchor, hotel.id);
    return {
      hotel,
      anchor,
      coordinate,
      distanceKm: calculateDistanceKm(destination, coordinate),
    };
  });
}

export function formatApproximateDistance(distanceKm) {
  return distanceKm < 10 ? distanceKm.toFixed(1) : distanceKm.toFixed(0);
}
