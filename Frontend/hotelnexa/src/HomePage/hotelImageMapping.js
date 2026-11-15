export function assignCityHotelImages(hotels, imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error("At least one hotel image is required.");
  }

  const cityIndexes = new Map();
  return [...hotels]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((hotel) => {
      const cityKey = `${hotel.state || ""}/${hotel.city}`;
      const imageIndex = cityIndexes.get(cityKey) || 0;
      cityIndexes.set(cityKey, imageIndex + 1);
      return { ...hotel, imageUrl: imageUrls[imageIndex % imageUrls.length] };
    });
}
