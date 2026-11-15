import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Cpu,
  Map,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { calculateRequiredBeds, MAX_CHILDREN, MAX_GUESTS } from "./occupancyRules.js";
import GuestCounter from "./GuestCounter.jsx";
import { hotelDirectory } from "./hotelDirectory.js";
import { getLocationSuggestions } from "./hotelSearch.js";
import { filterHotelListings } from "./hotelPresentation.js";
import {
  createStayResultsReturnUrl,
  createStaySearchParams,
  findStaySearchResults,
  readStaySearchParams,
} from "./staySearchUrl.js";
import { formatCurrency, getLocalDateOffset } from "../utils/stayFormatting.js";
import HotelPriceMap from "./HotelPriceMap.jsx";
import "./stayDiscovery.css";

const filterGroups = [
  {
    id: "rating",
    title: "Star rating",
    type: "radio",
    options: ["5 stars", "4 stars", "3 stars", "2 stars"],
  },
  {
    id: "offers",
    title: "Room offers",
    options: ["Breakfast included", "Free cancellation", "Pay at the property"],
  },
  {
    id: "facilities",
    title: "Property facilities",
    options: ["Free Wi-Fi", "Swimming pool", "Car park", "Restaurant", "Family friendly", "Non-smoking", "Pets allowed"],
  },
  {
    id: "amenities",
    title: "Room amenities",
    options: ["Air conditioning", "Heating", "Television", "Refrigerator", "Private bathroom", "Workspace", "Balcony"],
  },
  {
    id: "distance",
    title: "Distance to centre",
    type: "radio",
    options: ["Under 1 km", "Under 5 km", "Under 10 km"],
  },
];

const MAX_NIGHTLY_BUDGET = 50_000;
const HOTEL_RESULTS_PAGE_SIZE = 8;
const PREMIUM_STAYS_ROTATION_MS = 20_000;
const PREMIUM_STAYS_COUNT = 3;

function getRandomFiveStarHotels(excludedIds = new Set()) {
  const fiveStarHotels = hotelDirectory.filter((hotel) => hotel.presentation.stars === 5);
  const freshHotels = fiveStarHotels.filter((hotel) => !excludedIds.has(hotel.id));
  const pool = freshHotels.length >= PREMIUM_STAYS_COUNT ? freshHotels : fiveStarHotels;

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
  }

  return pool.slice(0, PREMIUM_STAYS_COUNT);
}

function getPageFromSearchParams(params) {
  const page = Number(params.get("page"));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getPaginationItems(totalPages, currentPage) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages]);
  for (let page = Math.max(2, currentPage - 1); page <= Math.min(totalPages - 1, currentPage + 1); page += 1) {
    pages.add(page);
  }
  const items = [];
  let previousPage = 0;
  for (const page of [...pages].sort((left, right) => left - right)) {
    if (page - previousPage > 1) items.push(`ellipsis-${previousPage}-${page}`);
    items.push(page);
    previousPage = page;
  }
  return items;
}

export default function StayDiscovery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeLocation = useLocation();
  const navigationType = useNavigationType();
  const [initialSearch] = useState(() => readStaySearchParams(searchParams));
  const [location, setLocation] = useState(initialSearch.location);
  const [selectedLocation, setSelectedLocation] = useState(initialSearch.selectedLocation);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(initialSearch.checkIn);
  const [checkOut, setCheckOut] = useState(initialSearch.checkOut);
  const [adults, setAdults] = useState(initialSearch.adults);
  const [children, setChildren] = useState(initialSearch.children);
  const [guestMenuOpen, setGuestMenuOpen] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(initialSearch.onlyAvailable);
  const [selectedFilters, setSelectedFilters] = useState(initialSearch.selectedFilters);
  const [minimumBudget, setMinimumBudget] = useState(initialSearch.minimumBudget);
  const [maximumBudget, setMaximumBudget] = useState(initialSearch.maximumBudget);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState(() => initialSearch.isSubmitted
    ? findStaySearchResults(hotelDirectory, initialSearch.location, initialSearch.selectedLocation)
    : null);
  const [currentPage, setCurrentPage] = useState(() => getPageFromSearchParams(searchParams));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapDistances, setMapDistances] = useState({});
  const [premiumStays, setPremiumStays] = useState(() => getRandomFiveStarHotels());

  const requiredBeds = calculateRequiredBeds(adults, children);
  const exceedsRoomCapacity = requiredBeds > 4;
  const searchSummary = searchResults === null
    ? ""
    : `${location.trim()} · ${searchResults.length} ${searchResults.length === 1 ? "hotel" : "hotels"} · ${requiredBeds} ${requiredBeds === 1 ? "bed" : "beds"} required · 1 room · ${onlyAvailable ? "available, unbooked rooms only" : "all room statuses"} · ₹${formatCurrency(minimumBudget)}–₹${formatCurrency(maximumBudget)} per night`;
  const minimumCheckout = checkIn || getLocalDateOffset(1);
  const budgetIsActive = minimumBudget > 0 || maximumBudget < MAX_NIGHTLY_BUDGET;
  const activeFilterCount = Object.values(selectedFilters).filter(Boolean).length + Number(onlyAvailable) + Number(budgetIsActive);
  const locationSuggestions = getLocationSuggestions(hotelDirectory, location);
  const displayedHotels = useMemo(() => (searchResults === null
    ? null
    : filterHotelListings(searchResults, requiredBeds, selectedFilters, minimumBudget, maximumBudget)), [
    maximumBudget,
    minimumBudget,
    requiredBeds,
    searchResults,
    selectedFilters,
  ]);
  const totalPages = Math.ceil((displayedHotels?.length || 0) / HOTEL_RESULTS_PAGE_SIZE);
  const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages));
  const paginatedHotels = displayedHotels?.slice(
    (safeCurrentPage - 1) * HOTEL_RESULTS_PAGE_SIZE,
    safeCurrentPage * HOTEL_RESULTS_PAGE_SIZE,
  );
  const paginationItems = getPaginationItems(totalPages, safeCurrentPage);
  const updateMapDistances = useCallback((distances) => setMapDistances(distances), []);
  const closeMap = useCallback(() => setMapOpen(false), []);
  const stayReturnUrl = createStayResultsReturnUrl(
    "/",
    searchParams.toString() ? `?${searchParams}` : "",
  );

  useEffect(() => {
    const rotation = window.setInterval(() => {
      setPremiumStays((current) => getRandomFiveStarHotels(new Set(current.map((hotel) => hotel.id))));
    }, PREMIUM_STAYS_ROTATION_MS);
    return () => window.clearInterval(rotation);
  }, []);

  function changePage(page) {
    setCurrentPage(page);
    document.getElementById("hotel-results-list")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  useEffect(() => {
    if (navigationType !== "POP") return;
    const restoredSearch = readStaySearchParams(searchParams);
    // Browser Back/Forward must restore controlled search fields from the URL.
    // oxlint-disable-next-line react/set-state-in-effect
    setLocation(restoredSearch.location);
    setSelectedLocation(restoredSearch.selectedLocation);
    setCheckIn(restoredSearch.checkIn);
    setCheckOut(restoredSearch.checkOut);
    setAdults(restoredSearch.adults);
    setChildren(restoredSearch.children);
    setOnlyAvailable(restoredSearch.onlyAvailable);
    setSelectedFilters(restoredSearch.selectedFilters);
    setMinimumBudget(restoredSearch.minimumBudget);
    setMaximumBudget(restoredSearch.maximumBudget);
    setSearchResults(restoredSearch.isSubmitted
      ? findStaySearchResults(hotelDirectory, restoredSearch.location, restoredSearch.selectedLocation)
      : null);
    setCurrentPage(getPageFromSearchParams(searchParams));
    setMapDistances({});
    setSuggestionsOpen(false);
    setSearchError("");
  }, [navigationType, routeLocation.key, searchParams]);

  useEffect(() => {
    if (searchResults === null) return;
    const nextParams = createStaySearchParams({
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
    });
    if (safeCurrentPage > 1) nextParams.set("page", String(safeCurrentPage));
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    adults,
    checkIn,
    checkOut,
    children,
    location,
    maximumBudget,
    minimumBudget,
    onlyAvailable,
    searchParams,
    searchResults,
    safeCurrentPage,
    selectedFilters,
    selectedLocation,
    setSearchParams,
  ]);

  function updateFilter(groupId, option, type) {
    setCurrentPage(1);
    setSelectedFilters((current) => {
      if (type === "radio") {
        return { ...current, [groupId]: current[groupId] === option ? "" : option };
      }
      const key = `${groupId}:${option}`;
      return { ...current, [key]: !current[key] };
    });
  }

  function updateMinimumBudget(value) {
    setCurrentPage(1);
    const nextMinimum = Math.min(MAX_NIGHTLY_BUDGET, Math.max(0, Number(value) || 0));
    setMinimumBudget(Math.min(nextMinimum, maximumBudget));
  }

  function updateMaximumBudget(value) {
    setCurrentPage(1);
    const nextMaximum = Math.min(MAX_NIGHTLY_BUDGET, Math.max(0, Number(value) || 0));
    setMaximumBudget(Math.max(nextMaximum, minimumBudget));
  }

  function clearFilters() {
    setCurrentPage(1);
    setSelectedFilters({});
    setOnlyAvailable(false);
    setMinimumBudget(0);
    setMaximumBudget(MAX_NIGHTLY_BUDGET);
  }

  function submitSearch(event) {
    event.preventDefault();
    setSearchError("");
    if (!location.trim()) {
      setSearchError("Enter a city, place, or hotel area to search.");
      return;
    }
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setSearchError("Check-out date must be after check-in.");
      return;
    }
    if (exceedsRoomCapacity) {
      setSearchError("This stay needs more than 4 beds. Extra rooms are not available in this search.");
      return;
    }
    const matchingHotels = findStaySearchResults(hotelDirectory, location.trim(), selectedLocation?.label === location ? selectedLocation : null);
    setSearchResults(matchingHotels);
    setCurrentPage(1);
    setMapDistances({});
    setSuggestionsOpen(false);
    setSearchParams(createStaySearchParams({
      location: location.trim(),
      selectedLocation: selectedLocation?.label === location ? selectedLocation : null,
      checkIn,
      checkOut,
      adults,
      children,
      onlyAvailable,
      selectedFilters,
      minimumBudget,
      maximumBudget,
    }));
  }

  function addChild() {
    setCurrentPage(1);
    if (children.length < 6) setChildren((current) => [...current, 5]);
  }

  function updateChildAge(index, age) {
    setCurrentPage(1);
    setChildren((current) => current.map((currentAge, childIndex) => childIndex === index ? Number(age) : currentAge));
  }

  function removeChild() {
    setCurrentPage(1);
    setChildren((current) => current.slice(0, -1));
  }

  return (
    <section className="stay-discovery" id="stay-discovery">
      <div className="discovery-container">
        <div className="discovery-heading">
          <div>
            <p className="discovery-eyebrow"><span className="live-dot" /> FIND YOUR NEXT STAY</p>
            <h2>Somewhere<br /><em>worth arriving.</em></h2>
          </div>
          <p>Set your destination and dates. We’ll make room for the rest.</p>
        </div>

        <form className="stay-search" onSubmit={submitSearch}>
          <div className="location-search-wrap">
            <label className="search-field location-field">
              <span><MapPin size={16} /> Where to?</span>
              <input
                value={location}
                onChange={(event) => {
                  const nextLocation = event.target.value;
                  setLocation(nextLocation);
                  setCurrentPage(1);
                  setSelectedLocation(null);
                  setSuggestionsOpen(Boolean(nextLocation));
                  setSearchResults(null);
                  setMapDistances({});
                  setSearchError("");
                  if (searchParams.toString()) {
                    setSearchParams(new URLSearchParams(), { replace: true });
                  }
                }}
                onFocus={() => setSuggestionsOpen(true)}
                placeholder="Search a state, city, place, or hotel"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen && locationSuggestions.length > 0}
                aria-controls="hotel-location-suggestions"
              />
            </label>
            {suggestionsOpen && locationSuggestions.length > 0 && (
              <div className="location-suggestions" id="hotel-location-suggestions" role="listbox" aria-label="Hotel location suggestions">
                {locationSuggestions.map((suggestion) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedLocation?.label === suggestion.label}
                    className="location-suggestion"
                    key={`${suggestion.type}-${suggestion.city || suggestion.state}-${suggestion.place || ""}-${suggestion.hotelName || ""}`}
                    onClick={() => {
                      setCurrentPage(1);
                      setSelectedLocation(suggestion);
                      setLocation(suggestion.label);
                      setSuggestionsOpen(false);
                      setSearchResults(null);
                      setMapDistances({});
                    }}
                  >
                    <span className="suggestion-icon"><MapPin size={15} /></span>
                    <span><strong>{suggestion.label}</strong><small>{suggestion.type}</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="search-field date-field">
            <span><CalendarDays size={16} /> Check-in</span>
            <input type="date" min={getLocalDateOffset(0)} value={checkIn} onChange={(event) => { setCheckIn(event.target.value); if (checkOut <= event.target.value) setCheckOut(""); }} />
          </label>
          <label className="search-field date-field">
            <span><CalendarDays size={16} /> Check-out</span>
            <input type="date" min={minimumCheckout} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
          </label>
          <div className="search-field guest-field">
            <span><Users size={16} /> Guests & room</span>
            <button type="button" className="guest-trigger" aria-expanded={guestMenuOpen} onClick={() => setGuestMenuOpen(!guestMenuOpen)}>
              {adults + children.length} guests · 1 room <ChevronDown size={15} />
            </button>
            {guestMenuOpen && (
              <div className="guest-popover">
                <GuestCounter label="Adults" description="Ages 18 or above" value={adults} minimum={1} maximum={MAX_GUESTS - children.length} onChange={(value) => { setCurrentPage(1); setAdults(value); }} className="guest-counter" />
                <GuestCounter label="Children" description="Ages 0–17" value={children.length} minimum={0} maximum={Math.min(MAX_CHILDREN, MAX_GUESTS - adults)} onChange={(value) => value > children.length ? addChild() : removeChild()} className="guest-counter" />
                {children.map((age, index) => (
                  <label className="child-age-row" key={`child-${index + 1}`}>
                    <span>Child {index + 1} age</span>
                    <select value={age} onChange={(event) => updateChildAge(index, event.target.value)}>
                      {Array.from({ length: 18 }, (_, childAge) => <option key={childAge} value={childAge}>{childAge} {childAge === 1 ? "year" : "years"} old</option>)}
                    </select>
                  </label>
                ))}
                <p className={exceedsRoomCapacity ? "bed-summary is-error" : "bed-summary"}>
                  {requiredBeds} {requiredBeds === 1 ? "bed" : "beds"} needed · one room, maximum 4 beds
                </p>
                <p className="child-policy">One child under 10 stays without an extra bed. Each additional child needs a bed.</p>
                <button type="button" className="guest-done" onClick={() => setGuestMenuOpen(false)}>Done</button>
              </div>
            )}
          </div>
          <button type="submit" className="stay-search-button" disabled={exceedsRoomCapacity}>SEARCH STAYS <ArrowRight size={16} /></button>
        </form>

        {searchError && <p className="search-feedback is-error" role="alert">{searchError}</p>}
        {exceedsRoomCapacity && !searchError && <p className="search-feedback is-error" role="status">More than 4 beds are not allowed in one room. Extra rooms are not available.</p>}
        {searchSummary && <p className="search-feedback" role="status"><Check size={15} /> Search: {searchSummary}.</p>}

        <div className="discovery-results" id="stay-results">
          <aside className={`stay-filters${filtersOpen ? " is-open" : ""}`}>
            <div className="filters-heading">
              <span><SlidersHorizontal size={16} /> FILTERS</span>
              {activeFilterCount > 0 && <button type="button" onClick={clearFilters}>Clear all</button>}
            </div>
            <section className="budget-filter" aria-labelledby="budget-filter-title">
              <h4 id="budget-filter-title">Your budget <span>(per night)</span></h4>
              <div className="budget-inputs">
                <label>
                  <span>MIN</span>
                  <div><b>₹</b><input type="number" min="0" max={maximumBudget} step="500" value={minimumBudget} onChange={(event) => updateMinimumBudget(event.target.value)} aria-label="Minimum nightly budget in rupees" /></div>
                </label>
                <label>
                  <span>MAX</span>
                  <div><b>₹</b><input type="number" min={minimumBudget} max={MAX_NIGHTLY_BUDGET} step="500" value={maximumBudget} onChange={(event) => updateMaximumBudget(event.target.value)} aria-label="Maximum nightly budget in rupees" /></div>
                </label>
              </div>
              <p className="budget-range-text">₹{formatCurrency(minimumBudget)} to ₹{formatCurrency(maximumBudget)}</p>
              <div className="budget-sliders">
                <label>
                  <span className="sr-only">Minimum nightly budget</span>
                  <input type="range" min="0" max={MAX_NIGHTLY_BUDGET} step="500" value={minimumBudget} onChange={(event) => updateMinimumBudget(event.target.value)} aria-label="Minimum nightly budget slider" />
                </label>
                <label>
                  <span className="sr-only">Maximum nightly budget</span>
                  <input type="range" min="0" max={MAX_NIGHTLY_BUDGET} step="500" value={maximumBudget} onChange={(event) => updateMaximumBudget(event.target.value)} aria-label="Maximum nightly budget slider" />
                </label>
              </div>
            </section>
            <label className="availability-toggle">
              <input type="checkbox" checked={onlyAvailable} onChange={(event) => { setCurrentPage(1); setOnlyAvailable(event.target.checked); }} />
              <span className="custom-checkbox"><Check size={12} /></span>
              <span>Available rooms only <small>(exclude booked)</small></span>
            </label>
            <p className="availability-note">Availability is checked against your selected check-in and check-out dates.</p>
            {filterGroups.map((group) => (
              <fieldset className="filter-group" key={group.id}>
                <legend>{group.title}</legend>
                {group.options.map((option) => {
                  const key = group.type === "radio" ? group.id : `${group.id}:${option}`;
                  const checked = selectedFilters[key] === option || selectedFilters[key] === true;
                  return (
                    <label className="filter-option" key={option}>
                      <input
                        type={group.type || "checkbox"}
                        name={group.type === "radio" ? group.id : undefined}
                        checked={Boolean(checked)}
                        onChange={() => updateFilter(group.id, option, group.type)}
                      />
                      <span className="custom-checkbox">{group.type !== "radio" && <Check size={12} />}</span>
                      <span>{option}</span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
            <p className="filter-note">Bed count is set by your guests and children’s ages in the search bar.</p>
          </aside>

          <div className="stay-results">
            <div className="results-toolbar">
              <div>
                <p className="discovery-eyebrow">THE NEXA COLLECTION</p>
                <h3>Featuring premium stays</h3>
              </div>
              <div className="results-actions">
                <button type="button" className="mobile-filter-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>
                  <SlidersHorizontal size={15} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </button>
                <button
                  type="button"
                  className={`map-search-button${searchResults === null || !location.trim() ? " is-disabled" : ""}`}
                  disabled={searchResults === null || !location.trim()}
                  onClick={() => setMapOpen(true)}
                >
                  <Map size={15} /> Search on map
                </button>
                <span className="results-count">INVENTORY PREVIEW</span>
              </div>
            </div>
            {displayedHotels === null ? (
              <>
                <div className="premium-card-grid" aria-label="Featured five-star hotels, rotating every 20 seconds">
                  {premiumStays.map((hotel) => (
                    <Link className="premium-stay-card" to={`/hotel/${hotel.id}`} key={hotel.id}>
                      <img src={hotel.imageUrl} alt={`${hotel.hotelName} property`} loading="lazy" />
                      <span className="premium-stay-stars" aria-label="5-star property">
                        {Array.from({ length: 5 }, (_, index) => <Star size={11} key={index} fill="currentColor" />)}
                        <b>5 STAR</b>
                      </span>
                      <span className="premium-stay-copy">
                        <strong>{hotel.hotelName}</strong>
                        <small>{hotel.place} · {hotel.city}, {hotel.state}</small>
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            ) : displayedHotels.length ? (
              <>
                <div className="hotel-results-list" id="hotel-results-list">
                  {paginatedHotels.map((hotel) => {
                    const HotelCard = hotel.HotelCard;
                    return (
                      <HotelCard
                        key={hotel.id}
                        hotelName={hotel.hotelName}
                        cityName={hotel.city}
                        placeName={hotel.place}
                        requiredBeds={requiredBeds}
                        hotelImage={hotel.imageUrl}
                        roomImages={hotel.roomImages}
                        hotelId={hotel.id}
                        presentation={hotel.presentation}
                        stateName={hotel.state}
                        guestCount={adults + children.length}
                        adultCount={adults}
                        childAges={children}
                        checkIn={checkIn}
                        checkOut={checkOut}
                        mapDistanceKm={mapDistances[hotel.id]}
                      />
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <nav className="hotel-pagination" aria-label="Hotel results pages">
                    {paginationItems.map((item) => (typeof item === "number" ? (
                      <button
                        type="button"
                        key={item}
                        className={`hotel-pagination-page${item === safeCurrentPage ? " is-active" : ""}`}
                        aria-current={item === safeCurrentPage ? "page" : undefined}
                        aria-label={`Page ${item}`}
                        onClick={() => changePage(item)}
                      >
                        {item}
                      </button>
                    ) : (
                      <span className="hotel-pagination-ellipsis" key={item} aria-hidden="true">…</span>
                    )))}
                  </nav>
                )}
              </>
            ) : (
              <p className="hotel-search-empty">No hotels match “{location}” and the selected filters. Try changing your budget or filters.</p>
            )}
            {displayedHotels === null && (
              <section className="smart-stay-showcase" aria-labelledby="smart-stay-title">
                <header className="smart-stay-heading">
                  <div>
                    <p className="smart-stay-eyebrow"><Cpu size={14} /> HOTELNEXA NEXAAI</p>
                    <h3 id="smart-stay-title">Meet your <em>AI booking companion.</em></h3>
                    <p>Share your destination, dates, guests and budget. Find hotels available for your dates, explore nearby alternatives when needed, and choose full or advance payment before you confirm.</p>
                  </div>
                  <span className="smart-stay-coming"><span /> READY TO HELP</span>
                </header>

                <div className="smart-stay-workspace">
                  <article className="smart-stay-trip-card">
                    <div className="smart-stay-card-label"><MessageSquareText size={13} /> YOUR TRIP BRIEF <span>EXAMPLE</span></div>
                    <div className="smart-stay-user-message">
                      “Find me a comfortable stay in Bhagalpur for two guests. I need two beds, breakfast, and want to stay under my budget.”
                    </div>
                    <p className="smart-stay-parsed-label"><Sparkles size={12} /> THE AGENT PICKS UP THE DETAILS</p>
                    <div className="smart-stay-trip-tags">
                      <span><MapPin size={12} /> Destination</span>
                      <span><CalendarDays size={12} /> Travel dates</span>
                      <span><Users size={12} /> Guests & beds</span>
                      <span><Wallet size={12} /> Budget</span>
                      <span><Check size={12} /> Must-have amenities</span>
                    </div>
                  </article>

                  <div className="smart-stay-journey" aria-label="AI hotel search and booking features">
                    <div className="smart-stay-journey-heading">
                      <span className="smart-stay-agent-icon"><Bot size={18} /></span>
                      <span><strong>Your NexaAI agent</strong><small>SEARCH · COMPARE · BOOK</small></span>
                      <Sparkles size={16} />
                    </div>
                    <div className="smart-stay-checklist">
                      <span><Check size={13} /> Match dates, guests, beds and budget</span>
                      <span><Check size={13} /> Check availability and suggest nearby stays</span>
                      <span><Check size={13} /> Choose full or advance payment</span>
                    </div>
                    <div className="smart-stay-approval">
                      <ShieldCheck size={17} />
                      <span><strong>You stay in control</strong><small>Review your stay and confirm before checkout.</small></span>
                    </div>
                  </div>
                </div>

                <div className="smart-stay-benefits">
                  <article>
                    <span className="smart-stay-benefit-icon"><MessageSquareText size={16} /></span>
                    <div><h4>Tell it what you need</h4><p>Share your destination, dates, guests, budget and hotel preferences in chat.</p></div>
                    <b>01</b>
                  </article>
                  <article>
                    <span className="smart-stay-benefit-icon"><Sparkles size={16} /></span>
                    <div><h4>Compare real options</h4><p>See available stays that fit your room needs, filters and budget, plus nearby alternatives.</p></div>
                    <b>02</b>
                  </article>
                  <article>
                    <span className="smart-stay-benefit-icon"><ShieldCheck size={16} /></span>
                    <div><h4>Choose how to pay</h4><p>Review your hotel, dates and total, then select full or advance payment before checkout.</p></div>
                    <b>03</b>
                  </article>
                </div>
                <div className="smart-stay-footer">
                  <span><ShieldCheck size={13} /> HOTEL SEARCH, AVAILABILITY CHECKS AND TEST-MODE BOOKING ARE CONNECTED.</span>
                  <span>YOUR TRIP. YOUR PAYMENT CHOICE. YOUR FINAL CONFIRMATION.</span>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      {mapOpen && displayedHotels && (
        <HotelPriceMap
          hotels={displayedHotels}
          bedCount={requiredBeds}
          location={location}
          selectedLocation={selectedLocation}
          returnTo={stayReturnUrl}
          onClose={closeMap}
          onDistancesChange={updateMapDistances}
        />
      )}
    </section>
  );
}
