import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Coffee,
  MapPin,
  ShieldCheck,
  UsersRound,
  Wifi,
  ZoomIn,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { formatCurrency, formatStayDate, getLocalDateOffset, getNextDate } from "../utils/stayFormatting.js";
import { MAX_CHILDREN, MAX_GUESTS } from "./occupancyRules.js";
import { bedTypes } from "./hotelDetailConfig.js";
import GuestCounter from "./GuestCounter.jsx";
import {
  cancelPendingReservation,
  createReservationOrder,
  loadRazorpayCheckout,
  verifyReservationPayment,
} from "../services/paymentService.js";

export default function ReservationSummary({
  presentation,
  checkIn,
  checkOut,
  updateCheckIn,
  updateCheckOut,
  adultCount,
  setAdultCount,
  childAges,
  updateChildAge,
  updateChildCount,
  guestCount,
  requiredBeds,
  selectedBeds,
  roomFitsGuests,
  stayNights,
  roomPrice,
  estimatedTotal,
  paymentType,
  setPaymentType,
  roomImage,
  paymentBusy,
  setPaymentBusy,
  hotelId,
  hotelName,
  roomTypeId,
  roomQuote,
  roomAvailabilityStatus,
  roomAvailabilityMessage,
  onPreviewPhoto,
  bookingNotice,
  setBookingNotice,
  onViewNearbyArea,
}) {
  const location = useLocation();
  const [signInRequired, setSignInRequired] = useState(false);
  const [verificationPayload, setVerificationPayload] = useState(null);
  const paymentCompleted = useRef(false);
  const checkoutClosed = useRef(false);
  const selectedBedType = bedTypes[selectedBeds - 1];
  const advanceAmount = Math.min(roomPrice.advance, estimatedTotal);
  const amountDueNow = paymentType === "Advance" ? advanceAmount : estimatedTotal;
  const balanceDue = estimatedTotal - amountDueNow;
  const signInHref = `/signin?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  async function releaseReservation(reservationId, message) {
    try {
      await cancelPendingReservation(reservationId);
      setBookingNotice(message);
    } catch (error) {
      setBookingNotice(`${message} ${error.message} If the hold remains, it will expire automatically.`);
    } finally {
      setPaymentBusy(false);
    }
  }

  async function verifyPayment(payload = verificationPayload) {
    if (!payload) return;
    setPaymentBusy(true);
    setSignInRequired(false);
    try {
      const result = await verifyReservationPayment(payload.reservationId, payload.payment);
      setVerificationPayload(null);
      setBookingNotice(result.reservation.confirmationEmailSent
        ? `Test payment verified. Booking confirmed. Paid now ₹${formatCurrency(result.reservation.amountPaid)}; balance due later ₹${formatCurrency(result.reservation.balanceDue)}. Details email sent. Reservation: ${result.reservation.id}`
        : `Test payment verified and booking confirmed. Paid now ₹${formatCurrency(result.reservation.amountPaid)}; balance due later ₹${formatCurrency(result.reservation.balanceDue)}. Email could not be sent yet; open My bookings to retry. Reservation: ${result.reservation.id}`);
    } catch (error) {
      if (error.status === 410) {
        setVerificationPayload(null);
        setBookingNotice(`${error.message} The booking was not confirmed. Contact support before taking any further action.`);
      } else {
        setBookingNotice(`Payment verification is pending: ${error.message} Do not pay again; you can retry verification.`);
      }
    } finally {
      setPaymentBusy(false);
    }
  }

  async function startTestCheckout() {
    setPaymentBusy(true);
    setSignInRequired(false);
    setBookingNotice("");
    setVerificationPayload(null);
    paymentCompleted.current = false;
    checkoutClosed.current = false;
    let reservationId = "";
    try {
      const result = await createReservationOrder({
        hotelId,
        roomTypeId,
        checkIn,
        checkOut,
        adults: adultCount,
        childAges,
        bedCount: selectedBeds,
        paymentType,
      });
      reservationId = result.reservation.id;
      if (result.reservation.amount !== estimatedTotal || result.reservation.amountDueNow !== amountDueNow) {
        await cancelPendingReservation(reservationId);
        throw new Error("The room price changed while checkout was starting. Review the refreshed stay total before paying.");
      }

      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay checkout did not initialize. Please try again.");
      const checkout = new window.Razorpay({
        key: result.checkout.key,
        order_id: result.checkout.orderId,
        amount: result.checkout.amount,
        currency: result.checkout.currency,
        name: "HotelNexa",
        description: `${hotelName} · ${paymentType} payment · ${stayNights} ${stayNights === 1 ? "night" : "nights"} · Razorpay Test Mode`,
        prefill: result.checkout.prefill,
        theme: { color: "#d7ff32" },
        modal: {
          ondismiss: () => {
            if (paymentCompleted.current || checkoutClosed.current) return;
            checkoutClosed.current = true;
            void releaseReservation(
              reservationId,
              "Checkout closed. The booking was not confirmed and the room hold was released.",
            );
          },
        },
        handler: async (response) => {
          paymentCompleted.current = true;
          const payload = {
            reservationId,
            payment: {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            },
          };
          setVerificationPayload(payload);
          await verifyPayment(payload);
        },
      });
      checkout.on("payment.failed", (response) => {
        if (paymentCompleted.current) return;
        setBookingNotice(
          response.error?.description
            ? `This payment attempt failed: ${response.error.description} You can try another test payment method; your room hold is still active.`
            : "This payment attempt failed. You can try another test payment method; your room hold is still active.",
        );
      });
      checkout.open();
    } catch (error) {
      if (reservationId) {
        try {
          await cancelPendingReservation(reservationId);
        } catch (cancelError) {
          setBookingNotice(`${error.message} The room hold could not be released: ${cancelError.message}`);
          setPaymentBusy(false);
          return;
        }
      }
      setSignInRequired(error.status === 401);
      setBookingNotice(error.status === 401
        ? "Please sign in before starting a reservation."
        : error.message || "Razorpay test checkout could not be started.");
      setPaymentBusy(false);
    }
  }

  return (
    <aside className="property-reservation-card" aria-label="Stay estimate">
      <p className="property-section-kicker">YOUR STAY</p>
      <h2>Reservation summary</h2>
      <p className="property-summary-caption">Adjust your dates and room choice to see an estimate.</p>
      <div className="property-date-fields">
        <label>Check-in<input type="date" value={checkIn} min={getLocalDateOffset(0)} disabled={paymentBusy} onChange={(event) => updateCheckIn(event.target.value)} /></label>
        <label>Check-out<input type="date" value={checkOut} min={getNextDate(checkIn)} disabled={paymentBusy} onChange={(event) => updateCheckOut(event.target.value)} /></label>
      </div>
      <section className="property-guest-editor" aria-label="Select guests">
        <div className="property-guest-editor-heading">
          <span><UsersRound size={15} /> Guests & room</span>
          <small>1 room · up to 4 beds</small>
        </div>
        <GuestCounter
          label="Adults"
          description="Ages 18 or above"
          value={adultCount}
          minimum={1}
          maximum={MAX_GUESTS - childAges.length}
          onChange={setAdultCount}
          disabled={paymentBusy}
        />
        <GuestCounter
          label="Children"
          description="Ages 0–17"
          value={childAges.length}
          minimum={0}
          maximum={Math.min(MAX_CHILDREN, MAX_GUESTS - adultCount)}
          onChange={updateChildCount}
          disabled={paymentBusy}
        />
        {childAges.map((age, index) => (
          <label className="property-child-age" key={`property-child-${index + 1}`}>
            <span>Child {index + 1} age</span>
            <select value={age} disabled={paymentBusy} onChange={(event) => updateChildAge(index, event.target.value)}>
              {Array.from({ length: 18 }, (_, childAge) => <option key={childAge} value={childAge}>{childAge} {childAge === 1 ? "year" : "years"} old</option>)}
            </select>
          </label>
        ))}
        <p className="property-guest-bed-summary">
          {guestCount} {guestCount === 1 ? "guest" : "guests"} · {requiredBeds} {requiredBeds === 1 ? "bed" : "beds"} required
        </p>
        {requiredBeds > 4 && (
          <p className="property-room-fit-warning" role="alert">
            A {requiredBeds}-bed room isn’t available. One room supports at most 4 beds; please book two rooms separately.
          </p>
        )}
        <p className="property-guest-policy">One child under 10 stays without an extra bed. Each additional child needs one.</p>
        <p className="property-guest-policy property-room-match-hint">Choose a room with the same bed count before continuing.</p>
      </section>
      <div className="property-selected-room">
        <button
          type="button"
          className="property-summary-image-trigger"
          disabled={paymentBusy}
          aria-label={`View larger ${selectedBedType.title} room photo`}
          onClick={() => onPreviewPhoto({ image: roomImage, label: `${selectedBedType.title} room preview` })}
        >
          <img src={roomImage} alt="" />
          <ZoomIn size={14} />
        </button>
        <div>
          <strong>{roomQuote?.roomType?.name || selectedBedType.title}</strong>
          <span>{selectedBeds} {selectedBeds === 1 ? "bed" : "beds"} · {roomQuote ? `capacity ${roomQuote.roomType.capacity}` : "sample room profile"}</span>
        </div>
        <b>₹{formatCurrency(roomPrice.from)}</b>
      </div>
      <ul className="property-summary-amenities">
        <li><Wifi size={15} /> Wi-Fi <Check size={14} /></li>
        {presentation.amenities.breakfast && <li><Coffee size={15} /> Breakfast listed <Check size={14} /></li>}
        <li><CalendarDays size={15} /> {stayNights} {stayNights === 1 ? "night" : "nights"} <span>{formatStayDate(checkIn)} – {formatStayDate(checkOut)}</span></li>
      </ul>
      <div className="property-estimate-total"><span>{roomQuote ? "Room total" : "Estimated total"} <small>{stayNights} × ₹{formatCurrency(roomPrice.from)} / night</small></span><strong>₹{formatCurrency(estimatedTotal)}</strong></div>
      <p className="property-advance-estimate">Advance reference · not charged separately <strong>₹{formatCurrency(roomPrice.advance)}</strong></p>
      <fieldset className="property-payment-choice" disabled={paymentBusy}>
        <legend>Choose payment amount</legend>
        <label>
          <input type="radio" name="paymentType" value="Full" checked={paymentType === "Full"} onChange={() => setPaymentType("Full")} />
          <span><strong>Pay in full</strong><small>Pay ₹{formatCurrency(estimatedTotal)} now</small></span>
        </label>
        <label>
          <input type="radio" name="paymentType" value="Advance" checked={paymentType === "Advance"} onChange={() => setPaymentType("Advance")} />
          <span><strong>Pay advance</strong><small>₹{formatCurrency(advanceAmount)} now · ₹{formatCurrency(balanceDue)} due later</small></span>
        </label>
      </fieldset>
      <button
        type="button"
        className="property-booking-button"
        disabled={!roomFitsGuests || paymentBusy || roomAvailabilityStatus !== "available"}
        onClick={startTestCheckout}
      >
        {paymentBusy
          ? "Preparing secure test checkout…"
          : roomAvailabilityStatus === "loading"
          ? "Checking room availability…"
          : roomAvailabilityStatus !== "available"
            ? "Room unavailable for these dates"
            : roomFitsGuests
            ? <>Pay ₹{formatCurrency(amountDueNow)} · {paymentType === "Advance" ? "advance" : "full"} · Test mode <ArrowRight size={16} /></>
          : requiredBeds > 4
            ? "Book two rooms separately"
            : "Choose a room matching your guests"}
      </button>
      {roomAvailabilityStatus === "unavailable" && (
        <p className="property-booking-notice" role="status">{roomAvailabilityMessage}</p>
      )}
      {roomAvailabilityStatus === "error" && (
        <p className="property-booking-notice" role="alert">{roomAvailabilityMessage}</p>
      )}
      {bookingNotice && <p className="property-booking-notice" role="status">{bookingNotice}</p>}
      {signInRequired && <Link className="property-signin-link" to={signInHref}>Sign in to continue <ArrowRight size={13} /></Link>}
      <Link className="property-signin-link" to="/my-bookings">View my bookings <ArrowRight size={13} /></Link>
      {verificationPayload && (
        <button type="button" className="property-payment-retry" disabled={paymentBusy} onClick={() => verifyPayment()}>
          Retry payment verification
        </button>
      )}
      <p className="property-payment-methods"><strong>Payment options:</strong> Wallets — MobiKwik, Airtel Payments Bank, and Ola Money (Postpaid + Wallet) — or Netbanking. Available options may vary in the Razorpay checkout.</p>
      <p className="property-secure-note"><ShieldCheck size={15} /> Razorpay Test Mode only · no real money is charged.</p>
      <button type="button" className="property-map-shortcut" disabled={paymentBusy} onClick={onViewNearbyArea}>
        <MapPin size={15} /> View nearby area <ArrowUpRight size={14} />
      </button>
    </aside>
  );
}
