import {
  BedDouble,
  Check,
  CircleCheck,
  ShieldCheck,
  UsersRound,
  Wifi,
  ZoomIn,
} from "lucide-react";
import { formatCurrency } from "../utils/stayFormatting.js";
import { bedTypes } from "./hotelDetailConfig.js";

export default function RoomSelection({
  hotel,
  presentation,
  guestCount,
  selectedBeds,
  requiredBeds,
  roomFitsGuests,
  roomQuote,
  disabled = false,
  onSelectBeds,
  onPreviewPhoto,
}) {
  return (
    <section className="property-section property-rooms-section" id="rooms">
      <div className="property-section-title-row">
        <div><p className="property-section-kicker">FIND YOUR FIT</p><h2>Room selection</h2></div>
        <span className="property-room-hint"><UsersRound size={15} /> {guestCount} guests · 1 room</span>
      </div>
      <div className="property-room-grid">
        {bedTypes.map(({ count, title, caption, icon: BedIcon }) => {
          const active = selectedBeds === count;
          const price = active && roomQuote
            ? {
              from: roomQuote.roomType.nightlyRate,
              to: roomQuote.roomType.nightlyRate,
              advance: roomQuote.roomType.advanceAmount,
            }
            : presentation.prices[count];
          const image = hotel.roomImages?.[count] || hotel.imageUrl;
          const photo = { image, label: `${title} room preview` };

          return (
            <article className={`property-room-card${active ? " is-selected" : ""}`} key={count}>
              <button
                type="button"
                className="property-room-image-trigger"
                disabled={disabled}
                aria-label={`View larger ${title} room photo`}
                onClick={() => onPreviewPhoto(photo)}
              >
                <img src={image} alt={`${title} room preview`} loading="lazy" />
                <span className="property-image-zoom-hint"><ZoomIn size={15} /> View photo</span>
              </button>
              <div className="property-room-copy">
                <span className="property-room-tag"><BedIcon size={14} /> {count} {count === 1 ? "bed" : "beds"} · {active && roomQuote ? "available" : "preview"}</span>
                <h3>{title}</h3>
                <p>{active && roomQuote ? `${roomQuote.roomType.name} · capacity ${roomQuote.roomType.capacity}` : caption}</p>
                <span className="property-room-amenities"><Wifi size={13} /> Wi-Fi listed <BedDouble size={13} /> Room photo preview</span>
                <p className="property-room-cancel"><Check size={13} /> Free cancellation listed</p>
                <div className="property-room-price"><strong>₹{formatCurrency(price.from)}</strong><span> / night</span></div>
                <p className="property-room-range">Estimate ₹{formatCurrency(price.from)}–₹{formatCurrency(price.to)} · advance ₹{formatCurrency(price.advance)}</p>
                <button
                  type="button"
                  className={active ? "property-room-select is-selected" : "property-room-select"}
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => onSelectBeds(count)}
                >
                  {active ? <><CircleCheck size={15} /> Selected for your stay</> : `Select ${title.toLowerCase()}`}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!roomFitsGuests && requiredBeds <= 4 && (
        <p className="property-room-fit-warning" role="status">
          This room needs {selectedBeds} {selectedBeds === 1 ? "bed" : "beds"}, but your guests need {requiredBeds}. Adjust guests below or choose the matching room type to continue.
        </p>
      )}
      <p className="property-inventory-note"><ShieldCheck size={14} /> The selected room’s rate and date availability are checked against HotelNexa demo inventory. Other room previews and property details are illustrative.</p>
    </section>
  );
}
