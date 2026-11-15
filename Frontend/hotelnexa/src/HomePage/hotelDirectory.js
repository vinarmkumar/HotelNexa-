import { assignCityHotelImages } from "./hotelImageMapping.js";
import { createHotelDirectoryPresentation } from "./hotelPresentation.js";
import cloudinaryAssetManifest from "./cloudinaryAssetManifest.json";
import HotelListingCard from "./HotelListingCard.jsx";
import { hotelDirectoryPaths } from "./hotelDirectoryData.js";

function titleCase(value) {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

const hotelEntries = hotelDirectoryPaths
  .map((path) => {
    const [stateFolder, cityFolder, placeFolder, hotelFolder] = path.split("/");
    const state = titleCase(stateFolder);
    const city = titleCase(cityFolder);
    const place = titleCase(placeFolder);
    return {
      id: `${stateFolder}/${cityFolder}/${placeFolder}/${hotelFolder}`,
      state,
      city,
      place,
      hotelName: `Hotel ${titleCase(hotelFolder.replace(/^hotel_/, ""))}`,
      HotelCard: HotelListingCard,
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

const hotelImages = Object.entries(cloudinaryAssetManifest)
  .filter(([assetPath]) => assetPath.startsWith("Hotels/"))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, imageUrl]) => imageUrl);

const bedImagesByType = Object.fromEntries(
  ["singlebed", "double bed", "triplebed", "fourbed"].map((bedFolder) => [
    bedFolder,
    Object.entries(cloudinaryAssetManifest)
      .filter(([assetPath]) => assetPath.startsWith(`ALLBEDTYPES/${bedFolder}/`))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, imageUrl]) => imageUrl),
  ]),
);

const placeIndexes = new Map();
const hotelsWithImages = assignCityHotelImages(hotelEntries, hotelImages).map((hotel) => {
  const placeKey = `${hotel.state}/${hotel.city}/${hotel.place}`;
  if (!placeIndexes.has(placeKey)) {
    const cityKey = `${hotel.state}/${hotel.city}`;
    const nextPlaceIndex = [...placeIndexes.keys()].filter((key) => key.startsWith(`${cityKey}/`)).length;
    placeIndexes.set(placeKey, nextPlaceIndex);
  }
  const placeIndex = placeIndexes.get(placeKey);
  const roomImages = {
    1: bedImagesByType.singlebed[placeIndex],
    2: bedImagesByType["double bed"][placeIndex],
    3: bedImagesByType.triplebed[placeIndex],
    4: bedImagesByType.fourbed[placeIndex],
  };
  return { ...hotel, roomImages };
});

export const hotelDirectory = createHotelDirectoryPresentation(hotelsWithImages);
