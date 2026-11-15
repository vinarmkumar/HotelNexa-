import { MAX_CHILDREN, MAX_GUESTS } from "./occupancyRules.js";
import { getLocalDateOffset, getNextDate, getValidDate } from "../utils/stayFormatting.js";
import { searchHotels } from "./hotelSearch.js";

const MAX_NIGHTLY_BUDGET = 50_000;
const LOCATION_TYPES = new Set(["state", "city", "place", "hotel"]);

function parseCount(value, fallback, maximum) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= maximum ? count : fallback;
}

function parseChildren(value) {
  if (!value) return [];
  return value.split(",")
    .slice(0, MAX_CHILDREN)
    .map(Number)
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17);
}

function parseFilters(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseSelectedLocation(params, label) {
  const type = params.get("locationType");
  if (!LOCATION_TYPES.has(type)) return null;

  const selectedLocation = { type, label };
  for (const field of ["state", "city", "place", "hotelName"]) {
    const value = params.get(`location${field[0].toUpperCase()}${field.slice(1)}`);
    if (value) selectedLocation[field] = value;
  }
  return selectedLocation;
}

function normalizeBudget(value, fallback) {
  if (value === null || value.trim() === "") return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.min(MAX_NIGHTLY_BUDGET, Math.max(0, amount)) : fallback;
}

export function readStaySearchParams(params) {
  const location = params.get("location") || "";
  const children = parseChildren(params.get("children"));
  const adults = parseCount(params.get("adults"), Math.max(1, 2 - children.length), MAX_GUESTS - children.length);
  const checkIn = getValidDate(params.get("checkIn"), 1);
  const requestedCheckOut = getValidDate(params.get("checkOut"), 2);
  const minimumBudget = normalizeBudget(params.get("minimumBudget"), 0);
  const maximumBudget = Math.max(
    minimumBudget,
    normalizeBudget(params.get("maximumBudget"), MAX_NIGHTLY_BUDGET),
  );
  const selectedFilters = parseFilters(params.get("filters"));
  const selectedLocation = parseSelectedLocation(params, location);
  const searchTarget = selectedLocation || location;

  return {
    adults,
    checkIn,
    checkOut: requestedCheckOut > checkIn ? requestedCheckOut : getNextDate(checkIn),
    children,
    isSubmitted: params.get("searched") === "1" && Boolean(location.trim()),
    location,
    maximumBudget,
    minimumBudget,
    onlyAvailable: params.get("onlyAvailable") === "1",
    selectedFilters,
    selectedLocation,
    searchTarget,
  };
}

export function createStaySearchParams({
  location,
  selectedLocation,
  checkIn,
  checkOut,
  adults,
  children,
  onlyAvailable,
  selectedFilters,
  minimumBudget,
  maximumBudget,
}) {
  const params = new URLSearchParams();
  params.set("searched", "1");
  params.set("location", location);
  params.set("checkIn", checkIn || getLocalDateOffset(1));
  params.set("checkOut", checkOut || getNextDate(checkIn || getLocalDateOffset(1)));
  params.set("adults", String(adults));
  if (children.length) params.set("children", children.join(","));
  if (onlyAvailable) params.set("onlyAvailable", "1");
  if (Object.values(selectedFilters).some(Boolean)) params.set("filters", JSON.stringify(selectedFilters));
  if (minimumBudget > 0) params.set("minimumBudget", String(minimumBudget));
  if (maximumBudget < MAX_NIGHTLY_BUDGET) params.set("maximumBudget", String(maximumBudget));

  if (selectedLocation) {
    params.set("locationType", selectedLocation.type);
    for (const [field, value] of Object.entries({
      state: selectedLocation.state,
      city: selectedLocation.city,
      place: selectedLocation.place,
      hotelName: selectedLocation.hotelName,
    })) {
      if (value) params.set(`location${field[0].toUpperCase()}${field.slice(1)}`, value);
    }
  }
  return params;
}

export function findStaySearchResults(hotels, location, selectedLocation) {
  return searchHotels(hotels, selectedLocation || location);
}

export function createStayResultsReturnUrl(pathname, search) {
  return `${pathname}${search}#stay-results`;
}

export function getSafeStayReturnUrl(search) {
  const returnTo = new URLSearchParams(search).get("returnTo");
  return returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
}
