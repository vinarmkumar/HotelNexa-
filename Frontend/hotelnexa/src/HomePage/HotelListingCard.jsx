import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  Heart,
  MapPin,
  Star,
  Wifi,
  Waves,
  UsersRound,
  Baby,
  ShieldCheck,
} from "lucide-react";
import { formatCurrency } from "../utils/stayFormatting.js";
import { createStayResultsReturnUrl } from "./staySearchUrl.js";

const amenityLabels = [
  ["wifi", "Free Wi-Fi", Wifi],
  ["breakfast", "Breakfast included", Check],
  ["pool", "Swimming pool", Waves],
  ["coupleFriendly", "Couples welcome", UsersRound],
  ["familyFriendly", "Family friendly", Baby],
  ["freeCancellation", "Free cancellation", ShieldCheck],
];

const bedLabels = { 1: "Single bed", 2: "Double bed", 3: "Triple bed", 4: "Four bed" };
export default function HotelListingCard({
  hotelId,
  hotelName,
  stateName,
  cityName,
  placeName,
  hotelImage,
  presentation,
  requiredBeds,
  guestCount,
  adultCount,
  childAges,
  checkIn,
  checkOut,
  mapDistanceKm,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [favorite, setFavorite] = useState(false);
  const selectedPrice = presentation.prices[requiredBeds] || presentation.prices[1];
  const selectedBedType = bedLabels[requiredBeds] || bedLabels[1];
  const displayedAmenities = amenityLabels.filter(([key]) => presentation.amenities[key]);
  const returnTo = createStayResultsReturnUrl(location.pathname, location.search);
  const detailsParams = new URLSearchParams({
    checkIn,
    checkOut,
    guests: String(guestCount),
    beds: String(requiredBeds),
    adults: String(adultCount),
    children: childAges.join(","),
    returnTo,
  });
  const detailsUrl = `/hotel/${hotelId}?${detailsParams}`;

  function openHotel(event) {
    if (event.target.closest("button, a, input, select, textarea")) return;
    navigate(detailsUrl);
  }

  function openHotelDetails() {
    navigate(detailsUrl);
  }

  function openBooking(paymentType) {
    const bookingParams = new URLSearchParams(detailsParams);
    bookingParams.set("paymentType", paymentType);
    navigate(`/hotel/${hotelId}?${bookingParams}`);
  }

  return (
    <article
      className="hotel-listing-card"
      data-hotel-id={hotelId}
      role="link"
      tabIndex={0}
      aria-label={`View ${hotelName} hotel details`}
      onClick={openHotel}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openHotelDetails();
        }
      }}
    >
      <div className="hotel-listing-main">
        <div className="hotel-card-photo-wrap">
          <img className="hotel-card-photo" src={hotelImage} alt={`${hotelName} property`} loading="lazy" />
          <button
            type="button"
            className={`hotel-favorite-button${favorite ? " is-favorite" : ""}`}
            aria-label={favorite ? `Remove ${hotelName} from saved hotels` : `Save ${hotelName}`}
            aria-pressed={favorite}
            onClick={() => setFavorite((current) => !current)}
          >
            <Heart size={19} fill={favorite ? "currentColor" : "none"} />
          </button>
        </div>

        <section className="hotel-card-info">
          <p className="hotel-card-eyebrow">THE NEXA COLLECTION</p>
          <h4>{hotelName}</h4>
          <p className="hotel-card-location">{stateName} · {cityName} · NEAR {placeName}</p>
          <div className="hotel-card-stars" aria-label={`${presentation.stars} star property`}>
            {Array.from({ length: presentation.stars }, (_, index) => <Star size={15} key={index} fill="currentColor" />)}
          </div>
          <div className="hotel-card-distance">
            <MapPin size={16} />
            <span>Near {placeName}, {cityName}<strong>
              {mapDistanceKm
                ? `≈ ${mapDistanceKm} km straight-line estimate`
                : `${presentation.distanceKm} km estimated preview distance`}
            </strong></span>
          </div>
          <div className="hotel-amenity-grid">
            {displayedAmenities.map(([key, label, Icon]) => (
              <span className="hotel-amenity" key={key}><Icon size={16} /> {label}</span>
            ))}
          </div>
          <p className="hotel-card-sample-note">
            {mapDistanceKm
              ? "Approximate map pin · distance is straight-line, not a road route"
              : "Illustrative listing details · distance estimate"}
          </p>
        </section>

        <aside className="hotel-card-price-panel">
          <div className="hotel-card-rating">
            <span>{presentation.ratingLabel}<small>Hotel rating</small></span>
            <strong>{presentation.rating}</strong>
          </div>
          <p className="hotel-price-range">Rooms: ₹{formatCurrency(presentation.lowestPrice)}–₹{formatCurrency(presentation.highestPrice)} / night</p>
          <p className="hotel-starting-price">Starting from <strong>₹{formatCurrency(selectedPrice.from)}</strong><small> / night</small></p>
          <p className="hotel-price-caption">For {guestCount} guests · {selectedBedType} · price estimate</p>
          <p className="hotel-cancellation-note"><Check size={14} /> Free cancellation available</p>
          <button
            type="button"
            className="hotel-advance-button"
            onClick={() => openBooking("Advance")}
          >
            Book with advance payment <strong>₹{formatCurrency(selectedPrice.advance)}</strong>
          </button>
          <button type="button" className="hotel-full-payment-button" onClick={() => openBooking("Full")}>
            Pay full amount
          </button>
          <button type="button" className="hotel-details-button" onClick={openHotelDetails}>
            View property
          </button>
        </aside>
      </div>

    </article>
  );
}
