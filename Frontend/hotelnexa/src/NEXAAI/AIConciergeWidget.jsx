import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  BedDouble,
  Bot,
  CalendarDays,
  Check,
  CircleCheck,
  CircleX,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Send,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { formatCurrency, formatStayDate } from "../utils/stayFormatting.js";
import { hotelDirectory } from "../HomePage/hotelDirectory.js";
import { calculateRequiredBeds, MAX_CHILDREN, MAX_GUESTS } from "../HomePage/occupancyRules.js";
import {
  cancelPendingReservation,
  createReservationOrder,
  loadRazorpayCheckout,
  verifyReservationPayment,
} from "../services/paymentService.js";
import {
  interpretConciergeMessage,
  searchConciergeHotels,
} from "../services/aiConciergeService.js";
import "./aiConciergeWidget.css";

const filterGroups = [
  { key: "starRatings", title: "Star rating", options: [5, 4, 3, 2].map((stars) => `${stars} Stars`) },
  { key: "offers", title: "Room offers", options: ["Breakfast included", "Free cancellation", "Pay at the property"] },
  { key: "facilities", title: "Property facilities", options: ["Free Wi-Fi", "Swimming pool"] },
  { key: "amenities", title: "Room amenities", options: ["Air conditioning", "Heating", "Television", "Refrigerator", "Balcony"] },
];

const initialFilters = {
  starRatings: [],
  offers: [],
  facilities: [],
  amenities: [],
  distanceKm: null,
};
const MAX_ROOM_BEDS = 4;

function getLocalDateOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextDate(value) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hotelUrl(hotel) {
  const params = new URLSearchParams({
    checkIn: hotel.checkIn,
    checkOut: hotel.checkOut,
    guests: String(hotel.guestCount),
    beds: String(hotel.bedCount),
    adults: String(hotel.adults),
  });
  if (hotel.childAges?.length) params.set("children", hotel.childAges.join(","));
  return `/hotel/${hotel.id}?${params}`;
}

export default function AIConciergeWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("welcome");
  const [messages, setMessages] = useState([{
    id: 1,
    role: "assistant",
    text: "Hello! How can I help you with your hotel booking today?",
  }]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState("");
  const [criteria, setCriteria] = useState(() => ({
    city: "",
    area: "",
    hotelName: "",
    adults: 2,
    childAges: [],
    maxBudget: 5000,
    checkIn: getLocalDateOffset(1),
    checkOut: getLocalDateOffset(2),
    filters: initialFilters,
    additionalRequirements: "",
  }));
  const [results, setResults] = useState(null);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState("Full");
  const transcriptRef = useRef(null);
  const messagesEndRef = useRef(null);
  const resultsRef = useRef(null);
  const firstHotelRef = useRef(null);
  const paymentCompletedRef = useRef(false);
  const checkoutClosedRef = useRef(false);
  const sequenceRef = useRef(1);

  const cities = useMemo(() => [...new Set(hotelDirectory.map((hotel) => hotel.city))].sort(), []);
  const areas = useMemo(() => [...new Set(hotelDirectory
    .filter((hotel) => !criteria.city || hotel.city.toLowerCase() === criteria.city.toLowerCase())
    .map((hotel) => hotel.place))].sort(), [criteria.city]);
  const hotelNames = useMemo(() => [...new Set(hotelDirectory
    .filter((hotel) => !criteria.city || hotel.city.toLowerCase() === criteria.city.toLowerCase())
    .map((hotel) => hotel.hotelName))].sort(), [criteria.city]);
  const guestCount = criteria.adults + criteria.childAges.length;
  const bedCount = calculateRequiredBeds(criteria.adults, criteria.childAges);

  useEffect(() => {
    if (stage === "results") {
      const transcript = transcriptRef.current;
      const target = firstHotelRef.current || resultsRef.current;
      if (transcript && target) {
        const transcriptTop = transcript.getBoundingClientRect().top;
        const targetTop = target.getBoundingClientRect().top;
        transcript.scrollTo({
          top: transcript.scrollTop + targetTop - transcriptTop - 10,
          behavior: "smooth",
        });
        return;
      }
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, results, stage, notice, formError]);

  function addMessage(role, text) {
    sequenceRef.current += 1;
    setMessages((current) => [...current, {
      id: sequenceRef.current,
      role,
      text,
    }]);
  }

  function resetFlow() {
    setStage("welcome");
    setBusy(false);
    setNotice("");
    setFormError("");
    setDraft("");
    setResults(null);
    setSelectedHotel(null);
    setSelectedPaymentType("Full");
    setCriteria((current) => ({
      ...current,
      city: "",
      area: "",
      hotelName: "",
      adults: 2,
      childAges: [],
      maxBudget: 5000,
      checkIn: getLocalDateOffset(1),
      checkOut: getLocalDateOffset(2),
      filters: initialFilters,
      additionalRequirements: "",
    }));
    addMessage("assistant", "Let's start fresh. Where would you like to stay?");
  }

  async function handleWelcomeSubmit(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    setFormError("");
    setBusy(true);
    addMessage("user", message);
    try {
      const { preferences } = await interpretConciergeMessage(message);
      setCriteria((current) => ({
        ...current,
        city: preferences.city || current.city,
        area: preferences.area || current.area,
        hotelName: preferences.hotelName || current.hotelName,
        adults: preferences.guestCount || current.adults,
        maxBudget: preferences.maxBudget || current.maxBudget,
      }));
      setStage("details");
      addMessage("assistant", "I can help with that. Review the search details below; you can adjust anything before we look for available rooms.");
    } catch (error) {
      setFormError(error.message || "I couldn't understand that request. Try a city or hotel name, or start a guided search.");
    } finally {
      setBusy(false);
    }
  }

  function startGuidedSearch() {
    setStage("details");
    setFormError("");
    addMessage("user", "Find me a hotel");
    addMessage("assistant", "Great. First, tell me where you want to stay and how many adults and children are travelling.");
  }

  function continueFromDetails(event) {
    event.preventDefault();
    setFormError("");
    if (!criteria.city.trim() && !criteria.hotelName.trim()) {
      setFormError("Enter a city or a specific hotel name.");
      return;
    }
    if (!bedCount || bedCount > MAX_ROOM_BEDS) {
      setFormError("This demo supports at most four required beds in one room. Adjust the guests or children’s ages.");
      return;
    }
    addMessage("user", `${criteria.hotelName || criteria.area || criteria.city} · ${criteria.adults} adults · ${criteria.childAges.length} children · ${bedCount} ${bedCount === 1 ? "bed" : "beds"} required · up to ₹${formatCurrency(Number(criteria.maxBudget))} per night`);
    addMessage("assistant", "Now choose your check-in and check-out dates.");
    setStage("dates");
  }

  function continueFromDates(event) {
    event.preventDefault();
    setFormError("");
    if (criteria.checkOut <= criteria.checkIn) {
      setFormError("Check-out must be after check-in.");
      return;
    }
    addMessage("user", `${formatStayDate(criteria.checkIn)} – ${formatStayDate(criteria.checkOut)}`);
    addMessage("assistant", "Choose any preferences you want me to use. Hotels will still need to match your dates, automatically calculated beds, city, and budget.");
    setStage("filters");
  }

  function toggleFilter(group, value) {
    setCriteria((current) => {
      const existing = current.filters[group];
      if (group === "starRatings") {
        const stars = Number(value.match(/\d+/)?.[0]);
        const selected = existing.includes(stars);
        return {
          ...current,
          filters: {
            ...current.filters,
            starRatings: selected ? existing.filter((item) => item !== stars) : [...existing, stars],
          },
        };
      }
      const selected = existing.includes(value);
      return {
        ...current,
        filters: {
          ...current.filters,
          [group]: selected ? existing.filter((item) => item !== value) : [...existing, value],
        },
      };
    });
  }

  function updateAdultCount(adults) {
    const requiredBeds = calculateRequiredBeds(adults, criteria.childAges);
    if (requiredBeds > MAX_ROOM_BEDS) {
      setFormError("This demo supports at most four required beds in one room. Adjust the children’s ages first.");
      return;
    }
    setFormError("");
    setCriteria((current) => ({ ...current, adults }));
  }

  function updateChildCount(childCount) {
    setFormError("");
    if (childCount < criteria.childAges.length) {
      setCriteria((current) => ({ ...current, childAges: current.childAges.slice(0, childCount) }));
      return;
    }
    if (childCount > MAX_CHILDREN || criteria.adults + childCount > MAX_GUESTS) {
      setFormError(`This demo supports up to ${MAX_CHILDREN} children and ${MAX_GUESTS} guests.`);
      return;
    }
    const childAges = [
      ...criteria.childAges,
      ...Array.from({ length: childCount - criteria.childAges.length }, () => 5),
    ];
    if (calculateRequiredBeds(criteria.adults, childAges) > MAX_ROOM_BEDS) {
      setFormError("This demo supports at most four required beds in one room. Change the child ages or remove a child.");
      return;
    }
    setCriteria((current) => ({ ...current, childAges }));
  }

  function updateChildAge(index, age) {
    const childAges = criteria.childAges.map((currentAge, childIndex) => (
      childIndex === index ? Number(age) : currentAge
    ));
    if (calculateRequiredBeds(criteria.adults, childAges) > MAX_ROOM_BEDS) {
      setFormError("This room can have at most four required beds. Reduce the adults or children first.");
      return;
    }
    setFormError("");
    setCriteria((current) => ({ ...current, childAges }));
  }

  function goToStage(nextStage) {
    setFormError("");
    setNotice("");
    setStage(nextStage);
  }

  function continueFromFilters() {
    setFormError("");
    addMessage("user", "Preferences selected");
    addMessage("assistant", "Any other specific requirements? Type them below, or choose No.");
    setStage("custom");
  }

  async function searchHotels(searchCriteria = criteria) {
    setStage("searching");
    setBusy(true);
    setNotice("");
    setFormError("");
    addMessage("assistant", "Searching available hotels...");
    try {
      const result = await searchConciergeHotels({
        ...searchCriteria,
        adults: searchCriteria.adults,
        childAges: searchCriteria.childAges,
        guestCount: searchCriteria.adults + searchCriteria.childAges.length,
        bedCount: calculateRequiredBeds(searchCriteria.adults, searchCriteria.childAges),
      });
      setResults(result);
      setStage("results");
      addMessage("assistant", result.message);
    } catch (error) {
      setStage("custom");
      setFormError(error.message || "Hotel search could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function submitCustomRequirements(event) {
    event.preventDefault();
    const requirement = criteria.additionalRequirements.trim();
    addMessage("user", requirement || "No additional requirements");
    void searchHotels();
  }

  function skipCustomRequirements() {
    const searchCriteria = { ...criteria, additionalRequirements: "" };
    setCriteria(searchCriteria);
    addMessage("user", "No additional requirements");
    void searchHotels(searchCriteria);
  }

  function chooseOtherDates() {
    setFormError("");
    setStage("dates");
    addMessage("assistant", "Let's try another check-in and check-out date. Your destination, bed count, and preferences will stay selected.");
  }

  function getAvailableChildCounts() {
    return Array.from({ length: MAX_CHILDREN + 1 }, (_, count) => count).filter((count) => {
      if (count < criteria.childAges.length) return true;
      if (criteria.adults + count > MAX_GUESTS) return false;
      const childAges = [
        ...criteria.childAges,
        ...Array.from({ length: count - criteria.childAges.length }, () => 5),
      ];
      return calculateRequiredBeds(criteria.adults, childAges) <= MAX_ROOM_BEDS;
    });
  }

  function requestBooking(hotel) {
    setSelectedHotel(hotel);
    setSelectedPaymentType("Full");
    setStage("confirm");
    setNotice("");
    addMessage("assistant", `Would you like to continue with ${hotel.hotelName}? Review the total below and confirm to open secure Razorpay Test Mode checkout.`);
  }

  async function confirmBooking() {
    if (!selectedHotel || busy) return;
    setBusy(true);
    setNotice("");
    setFormError("");
    paymentCompletedRef.current = false;
    checkoutClosedRef.current = false;
    let reservationId = "";
    try {
      const orderResult = await createReservationOrder({
        hotelId: selectedHotel.id,
        roomTypeId: selectedHotel.roomTypeId,
        checkIn: selectedHotel.checkIn,
        checkOut: selectedHotel.checkOut,
        adults: selectedHotel.adults,
        childAges: selectedHotel.childAges,
        bedCount: selectedHotel.bedCount,
        paymentType: selectedPaymentType,
      });
      reservationId = orderResult.reservation.id;
      const expectedDueNow = selectedPaymentType === "Advance"
        ? selectedHotel.advanceAmount
        : selectedHotel.total;
      if (orderResult.reservation.amount !== selectedHotel.total
        || orderResult.reservation.amountDueNow !== expectedDueNow) {
        await cancelPendingReservation(reservationId);
        reservationId = "";
        throw new Error("The confirmed price or advance amount changed. Review the payment details before paying.");
      }

      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay checkout could not be initialized. Please try again.");
      const checkout = new window.Razorpay({
        key: orderResult.checkout.key,
        order_id: orderResult.checkout.orderId,
        amount: orderResult.checkout.amount,
        currency: orderResult.checkout.currency,
        name: "HotelNexa",
        description: `${selectedHotel.hotelName} · ${selectedPaymentType} payment · ${selectedHotel.nights} ${selectedHotel.nights === 1 ? "night" : "nights"} · Test Mode`,
        prefill: orderResult.checkout.prefill,
        theme: { color: "#d4ff00" },
        modal: {
          ondismiss: () => {
            if (paymentCompletedRef.current || checkoutClosedRef.current) return;
            checkoutClosedRef.current = true;
            void cancelPendingReservation(reservationId)
              .then(() => {
                setPendingReservationId("");
                setNotice("Checkout closed. No booking was confirmed and the room hold was released.");
              })
              .catch((error) => setNotice(`Checkout closed. ${error.message}`))
              .finally(() => setBusy(false));
          },
        },
        handler: async (response) => {
          paymentCompletedRef.current = true;
          setStage("verifying");
          addMessage("assistant", "Payment received by Razorpay Test Mode. I'm verifying it with the server now...");
          try {
            const result = await verifyReservationPayment(reservationId, {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            setStage("complete");
            addMessage("assistant", `Booking confirmed at ${selectedHotel.hotelName}. Paid now ₹${formatCurrency(result.reservation.amountPaid)}; balance due later ₹${formatCurrency(result.reservation.balanceDue)}. Reservation reference: ${result.reservation.id}. ${result.reservation.confirmationEmailSent ? "A confirmation email was sent to your registered email." : "Check My Bookings if the confirmation email needs retrying."}`);
          } catch (error) {
            setStage("verification-pending");
            setNotice(error.status === 410
              ? `${error.message} The booking was not confirmed. Open My Bookings and contact support before taking any further action.`
              : `Payment verification is pending: ${error.message} Do not pay again; retry verification from My Bookings.`);
          } finally {
            setBusy(false);
          }
        },
      });
      checkout.on("payment.failed", (response) => {
        if (!paymentCompletedRef.current) {
          setNotice(`${response.error?.description || "This payment attempt failed."} Try another method in the checkout. Your room hold remains active.`);
        }
      });
      setStage("checkout");
      addMessage("assistant", "Secure Razorpay Test Mode checkout is ready. Complete the test payment in the popup to confirm the booking.");
      checkout.open();
      setBusy(false);
    } catch (error) {
      let cleanupNotice = "";
      if (reservationId) {
        try {
          await cancelPendingReservation(reservationId);
        } catch (cleanupError) {
          cleanupNotice = ` The pending room hold could not be released: ${cleanupError.message}`;
        }
      }
      if (error.status === 401) {
        setNotice("Please sign in before completing the reservation. After signing in, return here and confirm again.");
      } else {
        setNotice(`${error.message || "Test checkout could not be started."}${cleanupNotice}`);
      }
      setStage("confirm");
      setBusy(false);
    }
  }

  const signInHref = `/signin?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  return (
    <div className="ai-concierge-root">
      {open && (
        <section className="ai-concierge-panel" aria-label="NexaAI hotel booking assistant">
          <header className="ai-concierge-header">
            <div className="ai-concierge-brand-icon"><Sparkles size={18} /></div>
            <div className="ai-concierge-brand-copy">
              <strong>NEXA CONCIERGE</strong>
              <span><i /> AI HOTEL ASSISTANT</span>
            </div>
            <button type="button" className="ai-concierge-close" aria-label="Close concierge" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </header>

          <div className="ai-concierge-transcript" ref={transcriptRef} aria-live="polite">
            <div className="ai-concierge-day-label">YOUR STAY, YOUR STORY</div>
            {messages.map((message) => (
              <div className={`ai-concierge-message is-${message.role}`} key={message.id}>
                {message.role === "assistant" && <span className="ai-concierge-avatar"><Bot size={14} /></span>}
                <p>{message.text}</p>
              </div>
            ))}

            {stage === "welcome" && (
              <div className="ai-concierge-welcome-actions">
                <button type="button" onClick={startGuidedSearch}>Find a hotel <ArrowRight size={14} /></button>
                <span>Or describe a hotel, city, or stay in the message box below.</span>
              </div>
            )}

            {stage === "details" && (
              <form className="ai-concierge-card ai-concierge-details" onSubmit={continueFromDetails}>
                <div className="ai-concierge-card-heading"><MapPin size={15} /><strong>1 · Your destination</strong></div>
                <label>City
                  <input required list="ai-concierge-cities" value={criteria.city} onChange={(event) => setCriteria({ ...criteria, city: event.target.value })} placeholder="e.g. Bhagalpur" />
                  <datalist id="ai-concierge-cities">{cities.map((city) => <option key={city} value={city} />)}</datalist>
                </label>
                <label>Place or area <span>optional</span>
                  <input list="ai-concierge-areas" value={criteria.area} onChange={(event) => setCriteria({ ...criteria, area: event.target.value })} placeholder="e.g. Ajgaibinath Temple" />
                  <datalist id="ai-concierge-areas">{areas.map((area) => <option key={area} value={area} />)}</datalist>
                </label>
                <label>Specific hotel <span>optional</span>
                  <input list="ai-concierge-hotels" value={criteria.hotelName} onChange={(event) => setCriteria({ ...criteria, hotelName: event.target.value })} placeholder="Choose a hotel by name" />
                  <datalist id="ai-concierge-hotels">{hotelNames.map((hotel) => <option key={hotel} value={hotel} />)}</datalist>
                </label>
                <div className="ai-concierge-number-grid">
                  <label><UsersRound size={13} /> Adults
                    <select value={criteria.adults} onChange={(event) => updateAdultCount(Number(event.target.value))}>
                      {[1, 2, 3, 4].filter((count) => calculateRequiredBeds(count, criteria.childAges) <= MAX_ROOM_BEDS)
                        .map((count) => <option value={count} key={count}>{count}</option>)}
                    </select>
                  </label>
                  <label><UsersRound size={13} /> Children
                    <select value={criteria.childAges.length} onChange={(event) => updateChildCount(Number(event.target.value))}>
                      {getAvailableChildCounts().map((count) => <option value={count} key={count}>{count}</option>)}
                    </select>
                  </label>
                </div>
                {criteria.childAges.map((age, index) => (
                  <label className="ai-concierge-child-age" key={`concierge-child-${index + 1}`}>
                    Child {index + 1} age
                    <select value={age} onChange={(event) => updateChildAge(index, event.target.value)}>
                      {Array.from({ length: 18 }, (_, childAge) => (
                        <option key={childAge} value={childAge}>{childAge} {childAge === 1 ? "year" : "years"} old</option>
                      ))}
                    </select>
                  </label>
                ))}
                <p className="ai-concierge-bed-summary" aria-live="polite">
                  <BedDouble size={14} /> {guestCount} {guestCount === 1 ? "guest" : "guests"} · {bedCount} {bedCount === 1 ? "bed" : "beds"} required
                </p>
                <label>Max budget per night (₹)
                  <input type="number" min="1" max="50000" required value={criteria.maxBudget} onChange={(event) => setCriteria({ ...criteria, maxBudget: Number(event.target.value) })} />
                </label>
                <p className="ai-concierge-hint">Beds are calculated from guest count and child ages, like the main search. One child under 10 shares a bed; each additional child under 10 needs one extra bed. One room supports at most four beds.</p>
                {formError && <p className="ai-concierge-form-error" role="alert">{formError}</p>}
                <div className="ai-concierge-step-actions">
                  <button type="button" className="ai-concierge-secondary" onClick={() => goToStage("welcome")}><ArrowLeft size={14} /> Previous</button>
                  <button className="ai-concierge-primary" type="submit">Next: dates <ArrowRight size={15} /></button>
                </div>
              </form>
            )}

            {stage === "dates" && (
              <form className="ai-concierge-card" onSubmit={continueFromDates}>
                <div className="ai-concierge-card-heading"><CalendarDays size={15} /><strong>2 · Choose your dates</strong></div>
                <div className="ai-concierge-date-grid">
                  <label>Check-in
                    <input type="date" min={getLocalDateOffset(0)} value={criteria.checkIn} onChange={(event) => {
                      const checkIn = event.target.value;
                      setCriteria((current) => ({
                        ...current,
                        checkIn,
                        checkOut: current.checkOut <= checkIn ? nextDate(checkIn) : current.checkOut,
                      }));
                    }} />
                  </label>
                  <label>Check-out
                    <input type="date" min={nextDate(criteria.checkIn)} value={criteria.checkOut} onChange={(event) => setCriteria({ ...criteria, checkOut: event.target.value })} />
                  </label>
                </div>
                {formError && <p className="ai-concierge-form-error" role="alert">{formError}</p>}
                <div className="ai-concierge-step-actions">
                  <button type="button" className="ai-concierge-secondary" onClick={() => goToStage("details")}><ArrowLeft size={14} /> Previous</button>
                  <button className="ai-concierge-primary" type="submit">Next: preferences <ArrowRight size={15} /></button>
                </div>
              </form>
            )}

            {stage === "filters" && (
              <div className="ai-concierge-card">
                <div className="ai-concierge-card-heading"><Check size={15} /><strong>3 · Your preferences</strong></div>
                {filterGroups.map((group) => (
                  <fieldset className="ai-concierge-filter-group" key={group.key}>
                    <legend>{group.title}</legend>
                    <div className="ai-concierge-chips">
                      {group.options.map((option) => {
                        const selected = group.key === "starRatings"
                          ? criteria.filters.starRatings.includes(Number(option.match(/\d+/)?.[0]))
                          : criteria.filters[group.key].includes(option);
                        return (
                          <button
                            type="button"
                            className={selected ? "is-selected" : ""}
                            key={option}
                            aria-pressed={selected}
                            onClick={() => toggleFilter(group.key, option)}
                          >
                            {selected && <Check size={11} />}{option}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                <fieldset className="ai-concierge-filter-group">
                  <legend>Distance to centre</legend>
                  <div className="ai-concierge-chips">
                    {[1, 5, 10].map((distance) => (
                      <button
                        type="button"
                        className={criteria.filters.distanceKm === distance ? "is-selected" : ""}
                        aria-pressed={criteria.filters.distanceKm === distance}
                        key={distance}
                        onClick={() => setCriteria((current) => ({
                          ...current,
                          filters: { ...current.filters, distanceKm: current.filters.distanceKm === distance ? null : distance },
                        }))}
                      >
                        {criteria.filters.distanceKm === distance && <Check size={11} />}Under {distance} km
                      </button>
                    ))}
                  </div>
                </fieldset>
                <p className="ai-concierge-hint">These ratings, amenities, prices and distances are sample listing data.</p>
                <div className="ai-concierge-step-actions">
                  <button type="button" className="ai-concierge-secondary" onClick={() => goToStage("dates")}><ArrowLeft size={14} /> Previous</button>
                  <button type="button" className="ai-concierge-primary" onClick={continueFromFilters}>Next: requirements <ArrowRight size={15} /></button>
                </div>
              </div>
            )}

            {stage === "custom" && (
              <form className="ai-concierge-card" onSubmit={submitCustomRequirements}>
                <div className="ai-concierge-card-heading"><Sparkles size={15} /><strong>4 · Anything else?</strong></div>
                <label>Additional requirements
                  <textarea maxLength={240} value={criteria.additionalRequirements} onChange={(event) => setCriteria({ ...criteria, additionalRequirements: event.target.value })} placeholder="For example: close to the railway station" />
                </label>
                <p className="ai-concierge-hint">I’ll use this to rank the closest options. Required beds, dates and budget remain strict.</p>
                {formError && <p className="ai-concierge-form-error" role="alert">{formError}</p>}
                <div className="ai-concierge-button-row">
                  <button type="button" className="ai-concierge-secondary" onClick={() => goToStage("filters")}><ArrowLeft size={14} /> Previous</button>
                  <button type="button" className="ai-concierge-secondary" onClick={skipCustomRequirements}>No</button>
                  <button className="ai-concierge-primary" type="submit">Search hotels <ArrowRight size={15} /></button>
                </div>
              </form>
            )}

            {stage === "searching" && (
              <div className="ai-concierge-searching" role="status"><LoaderCircle size={17} className="ai-concierge-spinner" /> Searching available hotels…</div>
            )}

            {stage === "results" && results && (
              <div className="ai-concierge-results" ref={resultsRef}>
                <button type="button" className="ai-concierge-secondary ai-concierge-results-previous" onClick={() => goToStage("custom")}>
                  <ArrowLeft size={14} /> Previous: requirements & preferences
                </button>
                {results.hotels.length === 0 ? (
                  <div className="ai-concierge-card">
                    <p className="ai-concierge-empty">Try different stay dates, adjust your preferences, or search another area.</p>
                    <button type="button" className="ai-concierge-secondary" onClick={chooseOtherDates}>Choose other dates</button>
                    <button type="button" className="ai-concierge-secondary" onClick={() => setStage("details")}>Adjust search</button>
                  </div>
                ) : (
                  <>
                    {!results.exactMatch && (
                      <p className="ai-concierge-fallback">
                        {results.requestedHotel
                          ? `${results.requestedHotel} is shown first. Other available hotels are sorted by approximate distance to the city centre; missing preferences are listed on each card.`
                          : results.requestedLocationUnavailable
                          ? `Showing available alternatives for the same dates. Every option below matches your ${criteria.bedCount}-bed room requirement and budget.`
                          : results.nearbyFallback
                            ? `Showing nearby ${results.hotels[0]?.city || criteria.city} listings. Dates, bed count and budget match; missing preferences are listed on each card. Distances are illustrative.`
                            : "These available options are ranked by matched preferences; missing details are shown on each card."}
                      </p>
                    )}
                    {results.hotels.map((result, index) => {
                      const hotel = hotelDirectory.find((entry) => entry.id === result.id);
                      return (
                        <article className="ai-concierge-hotel-card" key={result.id} ref={index === 0 ? firstHotelRef : null}>
                          {hotel?.imageUrl && <img src={hotel.imageUrl} alt="" loading="lazy" />}
                          <div className="ai-concierge-hotel-content">
                            <div className="ai-concierge-hotel-title">
                              <div><h3>{result.hotelName}</h3><span>{result.place}, {result.city}</span></div>
                              <span className="ai-concierge-stars">{result.stars}★</span>
                            </div>
                            <p className="ai-concierge-hotel-price">₹{formatCurrency(result.nightlyRate)} <small>/ night</small></p>
                            <p className="ai-concierge-hotel-meta"><BedDouble size={12} /> {result.bedCount} beds · {result.guestCount} guests <MapPin size={12} /> {result.distanceKm} km to centre</p>
                            {result.matched.length > 0 && <p className="ai-concierge-matched"><Check size={12} /> Matches: {result.matched.join(", ")}</p>}
                            {result.missing.length > 0 && <p className="ai-concierge-missing"><CircleX size={12} /> Missing: {result.missing.join(", ")}</p>}
                            <div className="ai-concierge-hotel-actions">
                              <Link to={hotelUrl(result)} onClick={() => setOpen(false)}>View hotel <ArrowRight size={12} /></Link>
                              {result.available
                                ? <button type="button" onClick={() => requestBooking(result)}>Book now</button>
                                : <span className="ai-concierge-unavailable">Unavailable for these dates</span>}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    <p className="ai-concierge-hint">Demo listings only · availability is checked against HotelNexa test reservations.</p>
                    {results.requestedLocationUnavailable && (
                      <button type="button" className="ai-concierge-secondary ai-concierge-reset" onClick={chooseOtherDates}>
                        Choose other dates
                      </button>
                    )}
                    <button type="button" className="ai-concierge-secondary ai-concierge-reset" onClick={resetFlow}>No, I don’t want to book · Start over</button>
                  </>
                )}
              </div>
            )}

            {stage === "confirm" && selectedHotel && (
              <div className="ai-concierge-card ai-concierge-confirm">
                <div className="ai-concierge-card-heading"><CircleCheck size={15} /><strong>Final review</strong></div>
                <h3>{selectedHotel.hotelName}</h3>
                <p>{selectedHotel.place}, {selectedHotel.city} · {formatStayDate(selectedHotel.checkIn)} – {formatStayDate(selectedHotel.checkOut)}</p>
                <p>{selectedHotel.adults} adults · {selectedHotel.childAges.length} children · {selectedHotel.bedCount} beds · {selectedHotel.nights} {selectedHotel.nights === 1 ? "night" : "nights"}</p>
                <div className="ai-concierge-payment-choice" role="group" aria-label="Choose payment amount">
                  <label className={selectedPaymentType === "Full" ? "is-selected" : ""}>
                    <input type="radio" name="concierge-payment-type" value="Full" checked={selectedPaymentType === "Full"} onChange={() => setSelectedPaymentType("Full")} />
                    <span><strong>Pay in full</strong><small>₹{formatCurrency(selectedHotel.total)} now</small></span>
                  </label>
                  <label className={selectedPaymentType === "Advance" ? "is-selected" : ""}>
                    <input type="radio" name="concierge-payment-type" value="Advance" checked={selectedPaymentType === "Advance"} onChange={() => setSelectedPaymentType("Advance")} />
                    <span><strong>Pay advance</strong><small>₹{formatCurrency(selectedHotel.advanceAmount)} now · ₹{formatCurrency(selectedHotel.total - selectedHotel.advanceAmount)} due later</small></span>
                  </label>
                </div>
                <div className="ai-concierge-confirm-total"><span>Full stay total</span><strong>₹{formatCurrency(selectedHotel.total)}</strong></div>
                <div className="ai-concierge-confirm-total"><span>Pay now · {selectedPaymentType}</span><strong>₹{formatCurrency(selectedPaymentType === "Advance" ? selectedHotel.advanceAmount : selectedHotel.total)}</strong></div>
                {selectedPaymentType === "Advance" && <div className="ai-concierge-confirm-total"><span>Balance due later</span><strong>₹{formatCurrency(selectedHotel.total - selectedHotel.advanceAmount)}</strong></div>}
                <p className="ai-concierge-hint">Confirming opens Razorpay’s secure Test Mode checkout. No real money is charged; the booking is only confirmed after payment verification.</p>
                <p className="ai-concierge-payment-methods"><strong>Payment options:</strong> Wallets — MobiKwik, Airtel Payments Bank, and Ola Money (Postpaid + Wallet) — or Netbanking. Available options may vary in the Razorpay checkout.</p>
                {notice && <p className="ai-concierge-notice" role="status">{notice}{notice.includes("sign in") && <> <Link to={signInHref}>Sign in</Link></>}</p>}
                {formError && <p className="ai-concierge-form-error" role="alert">{formError}</p>}
                <div className="ai-concierge-button-row">
                  <button type="button" className="ai-concierge-secondary" disabled={busy} onClick={() => {
                    setStage("results");
                    setNotice("");
                  }}><ArrowLeft size={14} /> Previous</button>
                  <button type="button" className="ai-concierge-primary" disabled={busy} onClick={confirmBooking}>
                    {busy ? "Preparing checkout…" : <>Confirm & continue <ArrowRight size={14} /></>}
                  </button>
                </div>
              </div>
            )}

            {(stage === "checkout" || stage === "verifying") && (
              <div className="ai-concierge-checkout-state" role="status">
                {stage === "verifying" ? <LoaderCircle size={17} className="ai-concierge-spinner" /> : <CircleCheck size={17} />}
                {stage === "verifying" ? "Verifying test payment…" : "Finish payment in the secure Razorpay popup."}
              </div>
            )}

            {stage === "verification-pending" && (
              <div className="ai-concierge-card">
                <p className="ai-concierge-form-error" role="alert">{notice}</p>
                <Link className="ai-concierge-primary" to="/my-bookings" onClick={() => setOpen(false)}>Open My Bookings <ArrowRight size={14} /></Link>
              </div>
            )}

            {stage === "complete" && (
              <div className="ai-concierge-card ai-concierge-success">
                <CircleCheck size={26} />
                <strong>Your test booking is confirmed</strong>
                <Link to="/my-bookings" onClick={() => setOpen(false)}>View my bookings <ArrowRight size={14} /></Link>
                <button type="button" className="ai-concierge-secondary" onClick={resetFlow}>Find another hotel</button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {stage === "welcome" && (
            <form className="ai-concierge-composer" onSubmit={handleWelcomeSubmit}>
              <input
                aria-label="Describe the hotel or stay you want"
                maxLength={500}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="City, hotel, or what you need…"
                disabled={busy}
              />
              <button type="submit" aria-label="Send request" disabled={busy || !draft.trim()}>
                {busy ? <LoaderCircle size={17} className="ai-concierge-spinner" /> : <Send size={16} />}
              </button>
            </form>
          )}
          {stage === "welcome" && formError && <p className="ai-concierge-footer-error" role="alert">{formError}</p>}
          <footer className="ai-concierge-footer">
            <span><i /> Gemini AI · Test bookings only</span>
            <button type="button" onClick={resetFlow}>Reset</button>
          </footer>
        </section>
      )}

      <button
        type="button"
        className={`ai-concierge-launcher${open ? " is-open" : ""}`}
        aria-label={open ? "Close AI hotel concierge" : "Open AI hotel concierge"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={21} /> : <><MessageCircle size={19} /><span>NexaAI</span><Sparkles size={14} /></>}
      </button>
    </div>
  );
}
