import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { divIcon } from "leaflet";
import { Check, ChevronDown, LoaderCircle, MapPin, Search, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatCurrency } from "../utils/stayFormatting.js";
import {
  calculateDistanceKm,
  formatApproximateDistance,
  getApproximateHotelMapLocations,
} from "./hotelMapGeometry.js";
import "leaflet/dist/leaflet.css";

const PHOTON_URL = import.meta.env.VITE_PHOTON_URL || "https://photon.komoot.io/api/";
const OPENSTREETMAP_TILE_URL = import.meta.env.VITE_OSM_TILE_URL
  || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_PAGE_SIZE = 15;
const MAX_NIGHTLY_PRICE = 50_000;
const FALLBACK_MAP_CENTER = { latitude: 25.25, longitude: 87 };
const HOTEL_FEATURE_FILTERS = [
  { id: "airConditioning", label: "Air conditioning", key: "airConditioning" },
  { id: "nonAirConditioning", label: "Non-AC", key: "airConditioning", value: false },
  { id: "pool", label: "Swimming pool", key: "pool" },
  { id: "breakfast", label: "Breakfast included", key: "breakfast" },
  { id: "wifi", label: "Free Wi-Fi", key: "wifi" },
  { id: "restaurant", label: "Restaurant", key: "restaurant" },
  { id: "carPark", label: "Car parking", key: "carPark" },
  { id: "freeCancellation", label: "Free cancellation", key: "freeCancellation" },
  { id: "familyFriendly", label: "Family friendly", key: "familyFriendly" },
];

function getLocationQuery(location, selectedLocation) {
  if (selectedLocation?.type === "place" || selectedLocation?.type === "hotel") {
    return `${selectedLocation.place}, ${selectedLocation.city}, ${selectedLocation.state}, India`;
  }
  if (selectedLocation?.type === "city") return `${selectedLocation.city}, ${selectedLocation.state}, India`;
  if (selectedLocation?.type === "state") return `${selectedLocation.state}, India`;
  return `${location}, India`;
}

async function geocodeLocation(query, signal) {
  const params = new URLSearchParams({ q: query, limit: "1", lang: "en" });
  const response = await fetch(`${PHOTON_URL}?${params}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`Map search could not locate ${query} (HTTP ${response.status}).`);
  const data = await response.json();
  const coordinates = data.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return { longitude: Number(coordinates[0]), latitude: Number(coordinates[1]) };
}

function createHotelPriceIcon(price, selected) {
  return divIcon({
    className: "hotel-price-marker-wrapper",
    html: `<span class="hotel-price-marker${selected ? " is-selected" : ""}">₹${formatCurrency(price)}<i></i></span>`,
    iconSize: [92, 40],
    iconAnchor: [46, 40],
  });
}

const destinationIcon = divIcon({
  className: "hotel-map-destination-wrapper",
  html: '<span class="hotel-map-destination-pin"><i></i></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function MapViewport({ center, zoom, focusedCoordinate }) {
  const map = useMap();
  const centerLatitude = center[0];
  const centerLongitude = center[1];
  useEffect(() => {
    if (focusedCoordinate) {
      map.flyTo(
        [focusedCoordinate.latitude, focusedCoordinate.longitude],
        Math.max(zoom, 16),
        { animate: true, duration: 0.8 },
      );
      return;
    }
    map.setView([centerLatitude, centerLongitude], zoom, { animate: true });
  }, [centerLatitude, centerLongitude, focusedCoordinate, map, zoom]);
  return null;
}

function PriceSortedHotel({ hotel, price, distanceKm, distanceLabel, selected, onFocus, onOpen }) {
  return (
    <div
      className={`hotel-map-list-item${selected ? " is-selected" : ""}`}
    >
      <button
        type="button"
        className="hotel-map-list-focus"
        aria-label={`Show ${hotel.hotelName} on map`}
        onClick={() => onFocus(hotel.id)}
      >
        <img src={hotel.imageUrl} alt="" loading="lazy" />
        <span className="hotel-map-list-copy">
          <strong>{hotel.hotelName}</strong>
          <small>{hotel.place} · {hotel.city}</small>
          <small>{distanceLabel || (distanceKm === null
            ? "Approximate map pin unavailable"
            : `≈ ${formatApproximateDistance(distanceKm)} km straight-line estimate`)}
          </small>
        </span>
        <b>₹{formatCurrency(price)}</b>
      </button>
      <button type="button" className="hotel-map-view-button" onClick={() => onOpen(hotel.id)}>
        View hotel
      </button>
    </div>
  );
}

export default function HotelPriceMap({
  hotels,
  bedCount,
  location,
  selectedLocation,
  initialHotelId = "",
  returnTo,
  onClose,
  onDistancesChange,
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mapData, setMapData] = useState({
    destination: FALLBACK_MAP_CENTER,
    anchors: new Map(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedHotelId, setSelectedHotelId] = useState(initialHotelId);
  const [focusedHotelId, setFocusedHotelId] = useState(initialHotelId);
  const [sortMode, setSortMode] = useState(initialHotelId ? "nearby" : "price-low");
  const [minimumPrice, setMinimumPrice] = useState(0);
  const [maximumPrice, setMaximumPrice] = useState(MAX_NIGHTLY_PRICE);
  const [selectedFeatures, setSelectedFeatures] = useState({});
  const [featureFiltersOpen, setFeatureFiltersOpen] = useState(false);
  const [visibleHotelCount, setVisibleHotelCount] = useState(MAP_PAGE_SIZE);
  const [hotelSearch, setHotelSearch] = useState("");
  const targetQuery = getLocationQuery(location, selectedLocation);
  const pricedLocations = useMemo(() => (mapData
    ? getApproximateHotelMapLocations(hotels, mapData.anchors, mapData.destination)
    : []), [hotels, mapData]);
  const coordinatesByHotelId = useMemo(
    () => new Map(pricedLocations.map(({ hotel, anchor }) => [hotel.id, anchor])),
    [pricedLocations],
  );
  const filteredHotels = useMemo(() => {
    const query = hotelSearch.trim().toLocaleLowerCase();
    return hotels.filter((hotel) => {
      const matchesSearch = !query || [
        hotel.hotelName,
        hotel.place,
        hotel.city,
        hotel.state,
      ].some((value) => value.toLocaleLowerCase().includes(query));
      if (!matchesSearch) return false;
      const prices = hotel.presentation.prices[bedCount] || hotel.presentation.prices[1];
      if (prices.from > maximumPrice || prices.to < minimumPrice) return false;
      return HOTEL_FEATURE_FILTERS.every(({ id, key, value = true }) => (
        !selectedFeatures[id] || hotel.presentation.amenities[key] === value
      ));
    });
  }, [bedCount, hotelSearch, hotels, maximumPrice, minimumPrice, selectedFeatures]);
  const nearbyAnchor = initialHotelId
    ? coordinatesByHotelId.get(initialHotelId)
    : null;
  const sortedHotels = useMemo(() => [...filteredHotels].sort((left, right) => {
    if (sortMode === "nearby" && nearbyAnchor) {
      const leftAnchor = coordinatesByHotelId.get(left.id);
      const rightAnchor = coordinatesByHotelId.get(right.id);
      if (leftAnchor && rightAnchor) {
        return calculateDistanceKm(nearbyAnchor, leftAnchor)
          - calculateDistanceKm(nearbyAnchor, rightAnchor);
      }
    }
    const leftPrice = left.presentation.prices[bedCount]?.from || left.presentation.prices[1].from;
    const rightPrice = right.presentation.prices[bedCount]?.from || right.presentation.prices[1].from;
    if (sortMode === "price-high") return rightPrice - leftPrice;
    if (sortMode === "name") return left.hotelName.localeCompare(right.hotelName);
    return leftPrice - rightPrice;
  }), [bedCount, coordinatesByHotelId, filteredHotels, nearbyAnchor, sortMode]);
  const visibleHotels = useMemo(
    () => sortedHotels.slice(0, visibleHotelCount),
    [sortedHotels, visibleHotelCount],
  );
  const visibleHotelIds = useMemo(() => new Set(visibleHotels.map((hotel) => hotel.id)), [visibleHotels]);
  const selectedLocationData = pricedLocations.find((item) => (
    item.hotel.id === selectedHotelId && visibleHotelIds.has(item.hotel.id)
  ));
  const focusedLocation = pricedLocations.find((item) => (
    item.hotel.id === focusedHotelId && visibleHotelIds.has(item.hotel.id)
  ));
  const mapCenter = mapData
    ? [mapData.destination.latitude, mapData.destination.longitude]
    : [25.25, 87.0];
  const mapZoom = selectedLocation?.type === "state" ? 7 : selectedLocation?.type === "city" ? 12 : 14;

  function updateSearch(value) {
    setHotelSearch(value);
    setVisibleHotelCount(MAP_PAGE_SIZE);
  }

  function updateSortMode(value) {
    setSortMode(value);
    setVisibleHotelCount(MAP_PAGE_SIZE);
  }

  function toggleFeature(featureId) {
    setSelectedFeatures((current) => {
      const next = { ...current, [featureId]: !current[featureId] };
      if (featureId === "airConditioning" && next.airConditioning) next.nonAirConditioning = false;
      if (featureId === "nonAirConditioning" && next.nonAirConditioning) next.airConditioning = false;
      return next;
    });
    setVisibleHotelCount(MAP_PAGE_SIZE);
  }

  function focusHotel(hotelId) {
    setSelectedHotelId(hotelId);
    setFocusedHotelId(hotelId);
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    async function loadMap() {
      setLoading(true);
      setError("");
      try {
        const destination = await geocodeLocation(targetQuery, controller.signal);
        if (!destination) {
          throw new Error(`Could not find “${targetQuery}”. Try selecting a city or famous place suggestion.`);
        }

        const anchors = new Map();
        const broadSearch = selectedLocation?.type === "state" || selectedLocation?.type === "city";
        const groups = new Map();
        for (const hotel of hotels) {
          const key = broadSearch ? `${hotel.state}/${hotel.city}` : `${hotel.state}/${hotel.city}/${hotel.place}`;
          if (!groups.has(key)) {
            groups.set(key, broadSearch
              ? `${hotel.city}, ${hotel.state}, India`
              : `${hotel.place}, ${hotel.city}, ${hotel.state}, India`);
          }
        }

        const destinationKey = `${selectedLocation?.state || ""}/${selectedLocation?.city || ""}/${selectedLocation?.place || ""}`;
        const groupEntries = [...groups];
        const anchorsByGroup = await Promise.all(groupEntries.map(async ([key, query]) => {
          if (selectedLocation?.type === "city") {
            return [key, destination];
          }
          if (selectedLocation?.type === "place" && key === destinationKey) {
            return [key, destination];
          }
          const anchor = await geocodeLocation(query, controller.signal);
          return [key, anchor];
        }));

        if (controller.signal.aborted) return;
        for (const [key, anchor] of anchorsByGroup) {
          if (anchor) anchors.set(key, anchor);
        }
        const nextMapData = { destination, anchors };
        const nextLocations = getApproximateHotelMapLocations(hotels, anchors, destination);
        const distances = Object.fromEntries(nextLocations.map(({ hotel, distanceKm }) => [
          hotel.id,
          formatApproximateDistance(distanceKm),
        ]));
        setMapData(nextMapData);
        onDistancesChange?.(distances);
        setSelectedHotelId((current) => current || nextLocations[0]?.hotel.id || "");
      } catch (loadError) {
        if (loadError.name !== "AbortError") setError(loadError.message || "Map locations could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadMap();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [hotels, onDistancesChange, selectedLocation, targetQuery]);

  function openHotel(hotelId) {
    const hotel = hotels.find((entry) => entry.id === hotelId);
    if (!hotel) return;
    const price = hotel.presentation.prices[bedCount] || hotel.presentation.prices[1];
    const params = new URLSearchParams({
      checkIn: searchParams.get("checkIn") || "",
      checkOut: searchParams.get("checkOut") || "",
      guests: searchParams.get("guests") || "2",
      beds: String(bedCount),
      adults: searchParams.get("adults") || "2",
      children: searchParams.get("children") || "",
      returnTo,
    });
    params.set("mapPrice", String(price.from));
    onClose();
    navigate(`/hotel/${hotel.id}?${params}`);
  }

  return (
    <div className="hotel-price-map-overlay" role="dialog" aria-modal="true" aria-label="Hotels on map">
      <header className="hotel-price-map-header">
        <div>
          <p>HOTELNEXA MAP SEARCH</p>
          <h2><MapPin size={18} /> {location}</h2>
        </div>
        <label className="hotel-map-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={hotelSearch}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search nearby hotels or areas"
            aria-label="Search nearby hotels or areas"
          />
          {hotelSearch && (
            <button type="button" aria-label="Clear hotel search" onClick={() => updateSearch("")}>
              <X size={15} />
            </button>
          )}
        </label>
        <button type="button" aria-label="Close hotel map" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="hotel-price-map-body">
        <aside className="hotel-price-map-list">
          <div className="hotel-price-map-list-header">
            <span>{sortedHotels.length} nearby stays · {bedCount} {bedCount === 1 ? "bed" : "beds"}</span>
            <label>
              <span>Sort</span>
              <select value={sortMode} onChange={(event) => updateSortMode(event.target.value)}>
                {initialHotelId && <option value="nearby">Nearest to this hotel</option>}
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="name">Hotel name</option>
              </select>
            </label>
          </div>
          <div className="hotel-map-price-filter">
            <label>
              <span>Minimum ₹</span>
              <input
                type="number"
                min="0"
                max={maximumPrice}
                value={minimumPrice}
                onChange={(event) => {
                  const value = Math.max(0, Number(event.target.value) || 0);
                  setMinimumPrice(Math.min(value, maximumPrice));
                  setVisibleHotelCount(MAP_PAGE_SIZE);
                }}
                aria-label="Minimum nightly price"
              />
            </label>
            <label>
              <span>Maximum ₹</span>
              <input
                type="number"
                min={minimumPrice}
                max={MAX_NIGHTLY_PRICE}
                value={maximumPrice}
                onChange={(event) => {
                  const value = Math.min(MAX_NIGHTLY_PRICE, Math.max(0, Number(event.target.value) || 0));
                  setMaximumPrice(Math.max(value, minimumPrice));
                  setVisibleHotelCount(MAP_PAGE_SIZE);
                }}
                aria-label="Maximum nightly price"
              />
            </label>
          </div>
          <section className="hotel-map-feature-filters">
            <button
              type="button"
              className="hotel-map-feature-trigger"
              aria-haspopup="true"
              aria-expanded={featureFiltersOpen}
              onClick={() => setFeatureFiltersOpen((open) => !open)}
            >
              <span>Facilities & room features</span>
              <span className="hotel-map-feature-trigger-action">
                {Object.values(selectedFeatures).filter(Boolean).length
                  ? `${Object.values(selectedFeatures).filter(Boolean).length} selected`
                  : "Choose filters"}
                <ChevronDown size={13} />
              </span>
            </button>
            {featureFiltersOpen && (
              <div className="hotel-map-feature-options">
                {HOTEL_FEATURE_FILTERS.map(({ id, label }) => (
                  <label className={selectedFeatures[id] ? "is-checked" : ""} key={id}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedFeatures[id])}
                      onChange={() => toggleFeature(id)}
                    />
                    <span className="hotel-map-feature-check"><Check size={11} /></span>
                    <span>{label}</span>
                  </label>
                ))}
                {Object.values(selectedFeatures).some(Boolean) && (
                  <button type="button" className="hotel-map-clear-filters" onClick={() => {
                    setSelectedFeatures({});
                    setVisibleHotelCount(MAP_PAGE_SIZE);
                  }}>
                    Clear facilities
                  </button>
                )}
              </div>
            )}
          </section>
          {loading && <p className="hotel-map-status"><LoaderCircle size={16} className="hotel-map-spinner" /> Finding mapped area and stays…</p>}
          {error && <p className="hotel-map-status is-error" role="alert">{error}</p>}
          {visibleHotels.map((hotel) => {
            const price = hotel.presentation.prices[bedCount] || hotel.presentation.prices[1];
            const mappedLocation = pricedLocations.find((item) => item.hotel.id === hotel.id);
            return (
              <PriceSortedHotel
                key={hotel.id}
                hotel={hotel}
                price={price.from}
                distanceKm={mappedLocation && nearbyAnchor
                  ? calculateDistanceKm(nearbyAnchor, mappedLocation.anchor)
                  : mappedLocation?.distanceKm ?? null}
                distanceLabel={nearbyAnchor && mappedLocation
                  ? `≈ ${formatApproximateDistance(calculateDistanceKm(nearbyAnchor, mappedLocation.anchor))} km from this hotel`
                  : undefined}
                selected={selectedHotelId === hotel.id}
                onFocus={focusHotel}
                onOpen={openHotel}
              />
            );
          })}
          {!sortedHotels.length && (
            <p className="hotel-map-status" role="status">
              No nearby HotelNexa stays match these search and price filters. Try another hotel name, place, city, or price range.
            </p>
          )}
          {visibleHotelCount < sortedHotels.length && (
            <button
              type="button"
              className="hotel-map-load-more"
              onClick={() => setVisibleHotelCount((count) => count + MAP_PAGE_SIZE)}
            >
              View more hotels ({Math.min(MAP_PAGE_SIZE, sortedHotels.length - visibleHotelCount)} more)
            </button>
          )}
        </aside>
        <section className="hotel-price-map-canvas" aria-label="Hotel price markers map">
          {mapData && (
            <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom className="hotel-leaflet-map">
              <MapViewport
                center={mapCenter}
                zoom={mapZoom}
                focusedCoordinate={focusedLocation?.coordinate}
              />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
                url={OPENSTREETMAP_TILE_URL}
              />
              <Marker position={mapCenter} icon={destinationIcon}>
                <Popup><strong>Searched area</strong><br />{location}</Popup>
              </Marker>
              {pricedLocations.filter((item) => visibleHotelIds.has(item.hotel.id)).map((item) => {
                const price = item.hotel.presentation.prices[bedCount] || item.hotel.presentation.prices[1];
                return (
                  <Marker
                    key={item.hotel.id}
                    position={[item.coordinate.latitude, item.coordinate.longitude]}
                    icon={createHotelPriceIcon(price.from, selectedHotelId === item.hotel.id)}
                    eventHandlers={{ click: () => focusHotel(item.hotel.id) }}
                  >
                    <Popup>
                      <strong>{item.hotel.hotelName}</strong><br />
                      {item.hotel.place}, {item.hotel.city}<br />
                      ₹{formatCurrency(price.from)} / night<br />
                      ≈ {formatApproximateDistance(item.distanceKm)} km straight-line estimate<br />
                      <button type="button" onClick={() => openHotel(item.hotel.id)}>View stay</button>
                    </Popup>
                  </Marker>
                );
              })}
              {selectedLocationData && (
                <Circle
                  center={[selectedLocationData.coordinate.latitude, selectedLocationData.coordinate.longitude]}
                  radius={70}
                  pathOptions={{ color: "#d7ff32", fillColor: "#d7ff32", fillOpacity: 0.12 }}
                />
              )}
            </MapContainer>
          )}
          {loading && <div className="hotel-map-canvas-status"><LoaderCircle size={16} className="hotel-map-spinner" /><span>Updating map locations…</span></div>}
          {error && <div className="hotel-map-canvas-status is-error"><MapPin size={16} /><span>{error}</span></div>}
          <p className="hotel-map-provider-credit">Map tiles © OpenStreetMap contributors · Place lookup © OpenStreetMap via Photon</p>
        </section>
      </div>
    </div>
  );
}
