import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiRequest } from "../api.js";
import { hotelDirectory } from "./hotelDirectory.js";
import HotelPriceMap from "./HotelPriceMap.jsx";
import {
  amenityGroups,
  bedTypes,
  propertySectionLinks,
} from "./hotelDetailConfig.js";
import { getSafeStayReturnUrl } from "./staySearchUrl.js";
import { getNightCount, formatStayDate } from "../utils/stayFormatting.js";
import useHotelReservation from "./useHotelReservation.js";
import PropertyGallery from "./PropertyGallery.jsx";
import PropertyPhotoLightbox from "./PropertyPhotoLightbox.jsx";
import ReservationSummary from "./ReservationSummary.jsx";
import RoomSelection from "./RoomSelection.jsx";
import "./stayDiscovery.css";

function PropertyRating({ hotel }) {
  return (
    <div className="property-rating">
      <span className="property-stars" aria-label={`${hotel.presentation.stars} star property`}>
        {Array.from({ length: hotel.presentation.stars }, (_, index) => <Star key={index} size={16} fill="currentColor" />)}
      </span>
      <strong>{hotel.presentation.rating}</strong>
      <span>{hotel.presentation.ratingLabel} <small>illustrative rating</small></span>
    </div>
  );
}

function MissingProperty() {
  return (
    <main className="property-not-found">
      <Sparkles size={24} />
      <p className="discovery-eyebrow">HOTELNEXA PROPERTY VIEW</p>
      <h1>This stay could not be found.</h1>
      <p>The property link may be out of date. Return to the stay directory to explore available listings.</p>
      <Link to="/" className="property-primary-link"><ArrowLeft size={16} /> Back to stays</Link>
    </main>
  );
}

export default function HotelDetailPage() {
  const params = useParams();
  const location = useLocation();
  const hotelId = params["*"] || "";
  const returnTo = getSafeStayReturnUrl(location.search);
  const hotel = hotelDirectory.find((entry) => entry.id === hotelId);
  const reservation = useHotelReservation();
  const {
    adultCount,
    bookingNotice,
    checkIn,
    checkOut,
    childAges,
    guestCount,
    paymentType,
    requiredBeds,
    roomFitsGuests,
    selectedBeds,
    setAdultCount,
    setBookingNotice,
    setPaymentType,
    setSelectedBeds,
    updateCheckIn,
    updateCheckOut,
    updateChildAge,
    updateChildCount,
  } = reservation;
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [nearbyMapOpen, setNearbyMapOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [roomQuoteState, setRoomQuoteState] = useState(null);
  const closePhotoPreview = useCallback(() => setPreviewPhoto(null), [setPreviewPhoto]);
  const closeNearbyMap = useCallback(() => setNearbyMapOpen(false), [setNearbyMapOpen]);
  const nearbyHotels = useMemo(() => (hotel
    ? hotelDirectory.filter((entry) => entry.state === hotel.state && entry.city === hotel.city)
    : []), [hotel]);
  const quoteKey = hotel
    ? JSON.stringify([hotel.id, checkIn, checkOut, adultCount, childAges, selectedBeds])
    : "";
  const quoteEligible = Boolean(hotel && roomFitsGuests && requiredBeds <= 4);

  useEffect(() => {
    let active = true;
    if (!quoteEligible) return () => { active = false; };

    const query = new URLSearchParams({
      hotelId: hotel.id,
      checkIn,
      checkOut,
      adults: String(adultCount),
      childAges: childAges.join(","),
      bedCount: String(selectedBeds),
    });
    apiRequest(`/api/reservations/availability?${query}`)
      .then((data) => {
        if (!active) return;
        setRoomQuoteState({ key: quoteKey, status: "available", quote: data, message: "" });
      })
      .catch((error) => {
        if (!active) return;
        setRoomQuoteState({
          key: quoteKey,
          status: error.status === 409 ? "unavailable" : "error",
          quote: null,
          message: error.message || "Room availability could not be checked.",
        });
      });
    return () => { active = false; };
  }, [adultCount, checkIn, checkOut, childAges, hotel, quoteEligible, quoteKey, selectedBeds]);

  const currentQuoteState = roomQuoteState?.key === quoteKey ? roomQuoteState : null;
  const roomQuote = currentQuoteState?.quote || null;
  const roomAvailabilityStatus = quoteEligible ? currentQuoteState?.status || "loading" : "mismatch";
  const roomAvailabilityMessage = currentQuoteState?.message || "";

  if (!hotel) return <MissingProperty />;

  const { presentation } = hotel;
  const stayNights = getNightCount(checkIn, checkOut);
  const roomPrice = roomQuote
    ? {
      from: roomQuote.roomType.nightlyRate,
      to: roomQuote.roomType.nightlyRate,
      advance: roomQuote.roomType.advanceAmount,
    }
    : presentation.prices[selectedBeds];
  const roomImage = hotel.roomImages?.[selectedBeds] || hotel.imageUrl;
  const gallery = [
    { image: hotel.imageUrl, label: "Property exterior" },
    ...bedTypes.map((bed) => ({
      image: hotel.roomImages?.[bed.count] || hotel.imageUrl,
      label: `${bed.title} room preview`,
    })),
  ];
  const propertyAmenities = amenityGroups.flatMap((group) => group.items
    .filter(([key]) => presentation.amenities[key])
    .map(([key, title, Icon]) => ({ key, title, Icon, group: group.title })));
  const nearbyLocation = {
    type: "place",
    state: hotel.state,
    city: hotel.city,
    place: hotel.place,
    label: `${hotel.city}, ${hotel.state}`,
  };
  const estimatedTotal = roomQuote?.totalAmount ?? roomPrice.from * stayNights;
  return (
    <main className="property-page">
      <header className="property-toolbar">
        <Link to={returnTo} className="property-back-link"><ArrowLeft size={17} /> <span>Back to stays</span></Link>
        <div className="property-toolbar-summary">
          <span><CalendarDays size={15} /> {formatStayDate(checkIn)} – {formatStayDate(checkOut)}</span>
          <span><UsersRound size={15} /> {guestCount} {guestCount === 1 ? "guest" : "guests"} · {selectedBeds} {selectedBeds === 1 ? "bed" : "beds"}</span>
        </div>
        <a className="property-toolbar-cta" href="#rooms">Choose a room <ArrowRight size={15} /></a>
      </header>

      <div className="property-layout">
        <div className="property-content">
          <div className="property-breadcrumb">
            <Link to="/">Stays</Link><ChevronRight size={13} /><span>{hotel.state}</span><ChevronRight size={13} /><span>{hotel.city}</span>
          </div>

          <section className="property-heading">
            <div>
              <p className="property-eyebrow">THE NEXA COLLECTION <span>·</span> PROPERTY PREVIEW</p>
              <h1>{hotel.hotelName}</h1>
              <button type="button" className="property-address" onClick={() => setNearbyMapOpen(true)}>
                <MapPin size={16} /> Near {hotel.place}, {hotel.city}, {hotel.state} <ArrowUpRight size={13} />
              </button>
            </div>
            <PropertyRating hotel={hotel} />
          </section>

          <PropertyGallery hotel={hotel} photos={gallery} onPreviewPhoto={setPreviewPhoto} />

          <nav className="property-section-nav" aria-label="Property sections">
            {propertySectionLinks.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>

          <div className="property-detail-grid">
            <div className="property-main-column">
              <section className="property-section" id="overview">
                <p className="property-section-kicker">A CLOSER LOOK</p>
                <h2>Overview</h2>
                <p className="property-description">
                  Explore {hotel.hotelName}, a HotelNexa listing near {hotel.place} in {hotel.city}, {hotel.state}.
                  Browse sample room configurations, compare estimated rates, and review the listed facilities before planning your stay.
                </p>
                <div className="property-highlights">
                  {propertyAmenities.slice(0, 4).map(({ key, title, Icon }) => (
                    <span key={key}><Icon size={17} /> {title}</span>
                  ))}
                  <span><MapPin size={17} /> {presentation.distanceKm} km from the nearby place</span>
                </div>
                <p className="property-demo-disclosure"><Sparkles size={14} /> Listing details, ratings, distance and room prices are illustrative previews—not verified live hotel information.</p>
              </section>

              <RoomSelection
                hotel={hotel}
                presentation={presentation}
                guestCount={guestCount}
                selectedBeds={selectedBeds}
                requiredBeds={requiredBeds}
                roomFitsGuests={roomFitsGuests}
                roomQuote={roomQuote}
                disabled={paymentBusy}
                onSelectBeds={(count) => {
                  setSelectedBeds(count);
                  setBookingNotice("");
                }}
                onPreviewPhoto={setPreviewPhoto}
              />

              <section className="property-section" id="facilities">
                <p className="property-section-kicker">THOUGHTFUL DETAILS</p>
                <h2>Facilities & amenities</h2>
                {amenityGroups.map((group) => {
                  const available = propertyAmenities.filter((item) => item.group === group.title);
                  return (
                    <div className="property-facility-group" key={group.title}>
                      <h3>{group.title}</h3>
                      <div className="property-facility-grid">
                        {available.length ? available.map(({ key, title, Icon }) => (
                          <div className="property-facility" key={key}><Icon size={18} /><span>{title}</span><Check size={14} className="property-facility-check" /></div>
                        )) : <p className="property-unavailable">No {group.title.toLowerCase()} details listed for this preview.</p>}
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="property-section property-reviews" id="reviews">
                <p className="property-section-kicker">GUEST EXPERIENCES</p>
                <h2>Reviews & ratings</h2>
                <div className="property-review-summary">
                  <strong>{presentation.rating}</strong>
                  <div><span className="property-stars">{Array.from({ length: presentation.stars }, (_, index) => <Star key={index} size={15} fill="currentColor" />)}</span><b>{presentation.ratingLabel}</b><small>Illustrative preview score · not a verified guest rating</small></div>
                </div>
                <div className="property-no-reviews"><UsersRound size={22} /><div><strong>Guest reviews are not connected yet</strong><p>Verified reviews will appear here when the property review service is available. We don’t show invented guest feedback.</p></div></div>
              </section>

              <section className="property-section property-location" id="location">
                <p className="property-section-kicker">GETTING AROUND</p>
                <h2>Location</h2>
                <div className="property-map-card">
                  <div className="property-map-art" aria-hidden="true"><span className="map-route map-route-one" /><span className="map-route map-route-two" /><span className="map-pin-point"><MapPin size={20} /></span><span className="map-area-label">{hotel.city}</span></div>
                  <div className="property-map-details">
                    <span className="property-map-distance"><MapPin size={17} /> {presentation.distanceKm} km</span>
                    <h3>Near {hotel.place}</h3>
                    <p>{hotel.city}, {hotel.state}, India</p>
                    <button type="button" onClick={() => setNearbyMapOpen(true)}>View nearby HotelNexa stays <ArrowUpRight size={14} /></button>
                  </div>
                </div>
                <p className="property-inventory-note">Map preview is illustrative. The distance shown is a sample estimate, not live routing data.</p>
              </section>

              <section className="property-section" id="policies">
                <p className="property-section-kicker">BEFORE YOU ARRIVE</p>
                <h2>Property policies</h2>
                <div className="property-policy-list">
                  <details><summary><span><Clock3 size={16} /> Check-in & check-out</span><ChevronRight size={16} /></summary><p>Check-in and check-out times have not been provided by this sample listing. Please confirm directly with the property before travelling.</p></details>
                  <details><summary><span><ShieldCheck size={16} /> Cancellation & payment</span><ChevronRight size={16} /></summary><p>Bookings use Razorpay Test Mode and cannot charge real money. Free cancellation and advance amounts shown are illustrative; review the cancellation terms directly with the property.</p></details>
                  <details><summary><span><UsersRound size={16} /> Guests & children</span><ChevronRight size={16} /></summary><p>Guest and bed counts reflect your search. Actual room capacity and child policies must be confirmed with the property.</p></details>
                  <details><summary><span><Sparkles size={16} /> House rules</span><ChevronRight size={16} /></summary><p>Property-specific rules are not available in this demo directory. Contact the property to verify its current requirements.</p></details>
                </div>
              </section>
            </div>

            <ReservationSummary
              presentation={presentation}
              checkIn={checkIn}
              checkOut={checkOut}
              updateCheckIn={updateCheckIn}
              updateCheckOut={updateCheckOut}
              adultCount={adultCount}
              setAdultCount={setAdultCount}
              childAges={childAges}
              updateChildAge={updateChildAge}
              updateChildCount={updateChildCount}
              guestCount={guestCount}
              requiredBeds={requiredBeds}
              selectedBeds={selectedBeds}
              roomFitsGuests={roomFitsGuests}
              stayNights={stayNights}
              roomPrice={roomPrice}
              estimatedTotal={estimatedTotal}
              paymentType={paymentType}
              setPaymentType={setPaymentType}
              roomImage={roomImage}
              paymentBusy={paymentBusy}
              setPaymentBusy={setPaymentBusy}
              hotelId={hotel.id}
              hotelName={hotel.hotelName}
              roomTypeId={roomQuote?.roomType?.id}
              roomQuote={roomQuote}
              roomAvailabilityStatus={roomAvailabilityStatus}
              roomAvailabilityMessage={roomAvailabilityMessage}
              onPreviewPhoto={setPreviewPhoto}
              bookingNotice={bookingNotice}
              setBookingNotice={setBookingNotice}
              onViewNearbyArea={() => setNearbyMapOpen(true)}
            />
          </div>
        </div>
      </div>
      <footer className="property-footer"><Link to="/" className="property-footer-brand">HOTEL<span>NEXA</span></Link><span>Stay different · Find your next story</span><Link to="/">Explore more stays <ArrowRight size={14} /></Link></footer>
      <PropertyPhotoLightbox
        photo={previewPhoto}
        propertyName={hotel.hotelName}
        onClose={closePhotoPreview}
      />
      {nearbyMapOpen && (
        <HotelPriceMap
          hotels={nearbyHotels}
          bedCount={selectedBeds}
          location={nearbyLocation.label}
          selectedLocation={nearbyLocation}
          initialHotelId={hotel.id}
          returnTo={returnTo}
          onClose={closeNearbyMap}
        />
      )}
    </main>
  );
}
