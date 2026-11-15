import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CircleCheck, CircleX, Clock3, Hotel } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  createReservationBalanceOrder,
  getMyReservations,
  cancelConfirmedBooking,
  loadRazorpayCheckout,
  reconcileReservationPayment,
  releaseReservationBalanceOrder,
  resendReservationConfirmationEmail,
  verifyReservationBalancePayment,
} from "../services/paymentService.js";
import { formatCurrency, formatStayDate } from "../utils/stayFormatting.js";
import { hotelDirectory } from "./hotelDirectory.js";
import "./myBookings.css";

function getStatus(reservation) {
  if (reservation.status === "CancellationPending") {
    return {
      label: reservation.cancellationInitiatedBy === "hotelAdmin" ? "Hotel cancelled · refund processing" : "Cancelled · refund processing",
      className: "is-pending",
      Icon: Clock3,
    };
  }
  if (reservation.status === "Cancelled" && reservation.refundStatus === "Processed") {
    return {
      label: reservation.cancellationInitiatedBy === "hotelAdmin" ? "Hotel cancelled · refunded" : "Cancelled · amount refunded",
      className: "is-cancelled",
      Icon: CircleX,
    };
  }
  if (reservation.status === "Confirmed" && reservation.paymentStatus === "Success") {
    return {
      label: reservation.balanceDue > 0 ? "Confirmed · Advance paid" : "Confirmed · Paid in full",
      className: "is-confirmed",
      Icon: CircleCheck,
    };
  }
  if (reservation.status === "CheckedIn") {
    return { label: "Checked in", className: "is-confirmed", Icon: CircleCheck };
  }
  if (reservation.status === "CheckedOut") {
    return { label: "Checked out", className: "is-confirmed", Icon: CircleCheck };
  }
  if (reservation.refundId) {
    return { label: "Test payment refunded", className: "is-cancelled", Icon: CircleX };
  }
  if (reservation.status === "Cancelled" || reservation.paymentStatus === "Failed") {
    return { label: "Not confirmed", className: "is-cancelled", Icon: CircleX };
  }
  if (reservation.holdExpiresAt && new Date(reservation.holdExpiresAt) <= new Date()) {
    return { label: "Checkout expired · not confirmed", className: "is-cancelled", Icon: CircleX };
  }
  return { label: "Payment pending", className: "is-pending", Icon: Clock3 };
}

export default function MyBookings() {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reconcilingId, setReconcilingId] = useState("");
  const [reconcileMessage, setReconcileMessage] = useState("");
  const [reconcileError, setReconcileError] = useState("");
  const [emailRetryId, setEmailRetryId] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [cancellationMessage, setCancellationMessage] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const [balancePaymentId, setBalancePaymentId] = useState("");
  const [balancePaymentMessage, setBalancePaymentMessage] = useState("");
  const [balancePaymentError, setBalancePaymentError] = useState("");

  async function reconcilePayment(reservationId) {
    setReconcilingId(reservationId);
    setReconcileMessage("");
    setReconcileError("");
    try {
      const result = await reconcileReservationPayment(reservationId);
      setReservations((current) => current.map((reservation) =>
        reservation.id === reservationId ? result.reservation : reservation));
      setReconcileMessage(result.refunded
        ? result.message
        : "Captured test payment verified and reservation confirmed.");
    } catch (requestError) {
      setReconcileError(requestError.message || "The payment could not be reconciled.");
    } finally {
      setReconcilingId("");
    }
  }

  async function resendConfirmationEmail(reservationId) {
    setEmailRetryId(reservationId);
    setEmailMessage("");
    setEmailError("");
    try {
      const result = await resendReservationConfirmationEmail(reservationId);
      setReservations((current) => current.map((reservation) =>
        reservation.id === reservationId ? result.reservation : reservation));
      setEmailMessage("The email provider accepted your booking confirmation. Check your inbox, Spam, or Promotions.");
    } catch (requestError) {
      setEmailError(requestError.message || "The confirmation email could not be sent.");
    } finally {
      setEmailRetryId("");
    }
  }

  async function cancelBooking(reservationId, hotelName, amount) {
    const confirmed = window.confirm(
      `Cancel ${hotelName}? The full amount already paid (₹${formatCurrency(amount)}) will be refunded. This cannot be undone.`,
    );
    if (!confirmed) return;
    setCancellingId(reservationId);
    setCancellationMessage("");
    setCancellationError("");
    try {
      const result = await cancelConfirmedBooking(reservationId);
      setReservations((current) => current.map((reservation) =>
        reservation.id === reservationId ? result.reservation : reservation));
      setCancellationMessage(result.message);
    } catch (requestError) {
      setCancellationError(requestError.message || "The booking could not be cancelled.");
    } finally {
      setCancellingId("");
    }
  }

  async function payRemainingBalance(reservation) {
    setBalancePaymentId(reservation.id);
    setBalancePaymentMessage("");
    setBalancePaymentError("");
    let orderId = "";
    try {
      const result = await createReservationBalanceOrder(reservation.id);
      if (result.paid) {
        setReservations((current) => current.map((item) =>
          item.id === reservation.id ? result.reservation : item));
        setBalancePaymentMessage(`Remaining balance ₹${formatCurrency(result.reservation.balancePaid)} paid successfully. Your booking is fully paid.`);
        setBalancePaymentId("");
        return;
      }
      orderId = result.checkout.orderId;
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay checkout did not initialize. Please try again.");

      let paymentCompleted = false;
      const checkout = new window.Razorpay({
        key: result.checkout.key,
        order_id: result.checkout.orderId,
        amount: result.checkout.amount,
        currency: result.checkout.currency,
        name: "HotelNexa",
        description: "Remaining balance · Razorpay Test Mode",
        prefill: result.checkout.prefill,
        theme: { color: "#d7ff32" },
        modal: {
          ondismiss: () => {
            if (paymentCompleted) return;
            releaseReservationBalanceOrder(reservation.id, orderId)
              .then((releaseResult) => {
                if (releaseResult.reservation) {
                  setReservations((current) => current.map((item) =>
                    item.id === reservation.id ? releaseResult.reservation : item));
                }
                setBalancePaymentMessage(releaseResult.released
                  ? "Balance checkout closed. No remaining payment was made."
                  : "The balance checkout is up to date.");
              })
              .catch((requestError) => {
                setBalancePaymentError(requestError.message || "The balance checkout could not be safely closed.");
              })
              .finally(() => setBalancePaymentId(""));
          },
        },
        handler: async (response) => {
          paymentCompleted = true;
          try {
            const verified = await verifyReservationBalancePayment(reservation.id, {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            setReservations((current) => current.map((item) =>
              item.id === reservation.id ? verified.reservation : item));
            setBalancePaymentMessage(`Remaining balance ₹${formatCurrency(verified.reservation.balancePaid)} paid successfully. Your booking is fully paid.`);
          } catch (requestError) {
            setBalancePaymentError(`${requestError.message || "The remaining payment could not be verified."} Do not pay again until you check the booking status.`);
          } finally {
            setBalancePaymentId("");
          }
        },
      });
      checkout.on("payment.failed", (response) => {
        setBalancePaymentError(response.error?.description
          ? `This balance payment attempt failed: ${response.error.description}`
          : "This balance payment attempt failed. You can try again.");
      });
      checkout.open();
    } catch (requestError) {
      if (orderId) {
        try {
          const releaseResult = await releaseReservationBalanceOrder(reservation.id, orderId);
          if (releaseResult.reservation) {
            setReservations((current) => current.map((item) =>
              item.id === reservation.id ? releaseResult.reservation : item));
          }
        } catch (releaseError) {
          setBalancePaymentError(`${requestError.message || "The balance checkout could not be started."} The checkout could not be safely closed: ${releaseError.message}`);
          setBalancePaymentId("");
          return;
        }
      }
      setBalancePaymentError(requestError.message || "The remaining-balance checkout could not be started.");
      setBalancePaymentId("");
    }
  }

  useEffect(() => {
    let active = true;
    getMyReservations()
      .then((result) => {
        if (active) setReservations(result.reservations);
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError.status === 401) {
          navigate(`/signin?returnTo=${encodeURIComponent("/my-bookings")}`, { replace: true });
          return;
        }
        setError(requestError.message || "Your bookings could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    if (!reservations.some((reservation) => reservation.status === "CancellationPending")) return undefined;
    let active = true;
    const timer = setInterval(() => {
      getMyReservations()
        .then((result) => {
          if (active) setReservations(result.reservations);
        })
        .catch((requestError) => {
          if (active) setCancellationError(requestError.message || "Refund status could not be refreshed.");
        });
    }, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [reservations]);

  return (
    <main className="my-bookings-page">
      <header className="my-bookings-header">
        <Link className="my-bookings-brand" to="/">HOTEL<span>NEXA</span><i>®</i></Link>
        <Link className="my-bookings-back" to="/"><ArrowLeft size={15} /> Explore stays</Link>
      </header>
      <section className="my-bookings-content">
        <p className="my-bookings-eyebrow"><Hotel size={15} /> YOUR HOTELNEXA ACCOUNT</p>
        <h1>Your bookings,<br /><em>all in one place.</em></h1>
        <p className="my-bookings-intro">Review your reservation details and test-payment status.</p>
        {loading && <p className="my-bookings-state" role="status">Loading your reservations…</p>}
        {!loading && error && (
          <div className="my-bookings-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>Try again</button>
          </div>
        )}
        {!loading && !error && reservations.length === 0 && (
          <div className="my-bookings-empty">
            <CalendarDays size={23} />
            <h2>No bookings yet</h2>
            <p>Once you complete a test checkout, your reservation will appear here.</p>
            <Link to="/">Explore hotels <ArrowRight size={15} /></Link>
          </div>
        )}
        {!loading && !error && reservations.length > 0 && (
          <div className="my-bookings-list">
            {reconcileMessage && <p className="my-bookings-reconcile-success" role="status">{reconcileMessage}</p>}
            {reconcileError && <p className="my-bookings-reconcile-error" role="alert">{reconcileError}</p>}
            {emailMessage && <p className="my-bookings-reconcile-success" role="status">{emailMessage}</p>}
            {emailError && <p className="my-bookings-reconcile-error" role="alert">{emailError}</p>}
            {cancellationMessage && <p className="my-bookings-reconcile-success" role="status">{cancellationMessage}</p>}
            {cancellationError && <p className="my-bookings-reconcile-error" role="alert">{cancellationError}</p>}
            {balancePaymentMessage && <p className="my-bookings-reconcile-success" role="status">{balancePaymentMessage}</p>}
            {balancePaymentError && <p className="my-bookings-reconcile-error" role="alert">{balancePaymentError}</p>}
            {reservations.map((reservation) => {
              const hotel = hotelDirectory.find((entry) => entry.id === reservation.hotelId);
              const status = getStatus(reservation);
              const StatusIcon = status.Icon;
              const totalAmount = reservation.totalAmount ?? reservation.amount;
              const amountPaid = reservation.amountPaid
                ?? (reservation.paymentStatus === "Success"
                  ? reservation.amountDueNow ?? reservation.amount
                  : 0);
              const balanceDue = reservation.balanceDue ?? Math.max(0, totalAmount - amountPaid);
              const refunded = reservation.status === "Cancelled" && reservation.refundStatus === "Processed";
              return (
                <article className="my-booking-card" key={reservation.id}>
                  <div className="my-booking-card-top">
                    <div className="my-booking-hotel">
                      <span className="my-booking-icon"><Hotel size={18} /></span>
                      <div>
                        <h2>{hotel?.hotelName || "HotelNexa stay"}</h2>
                        <p>{hotel ? `${hotel.city}, ${hotel.state}` : "HotelNexa directory listing"}</p>
                      </div>
                    </div>
                    <span className={`my-booking-status ${status.className}`}><StatusIcon size={14} /> {status.label}</span>
                  </div>
                  <div className="my-booking-details">
                    <span><small>CHECK-IN</small><strong>{formatStayDate(reservation.checkIn)}</strong></span>
                    <span><small>CHECK-OUT</small><strong>{formatStayDate(reservation.checkOut)}</strong></span>
                    <span><small>ROOM</small><strong>{reservation.bedCount} {reservation.bedCount === 1 ? "bed" : "beds"} · 1 room</strong></span>
                    <span><small>GUESTS</small><strong>{reservation.adults + reservation.childAges.length}</strong></span>
                  </div>
                  <div className="my-booking-card-bottom">
                    <span>{reservation.nights} {reservation.nights === 1 ? "night" : "nights"} · ₹{formatCurrency(reservation.nightlyRate)} / night</span>
                    <strong>Total ₹{formatCurrency(totalAmount)}</strong>
                  </div>
                  <div className="my-booking-payment-breakdown">
                    <span>{refunded ? "Amount refunded" : reservation.paymentType === "Advance" ? "Advance paid" : "Paid"} <strong>₹{formatCurrency(reservation.balanceTransactionId ? reservation.amountDueNow : amountPaid)}</strong></span>
                    <span>{refunded ? "Remaining balance" : reservation.balanceTransactionId ? "Balance paid" : "Balance due later"} <strong>{refunded ? "Not payable" : `₹${formatCurrency(reservation.balanceTransactionId ? reservation.balancePaid : balanceDue)}`}</strong></span>
                    <span>Payment option <strong>{reservation.paymentType || "Full"}</strong></span>
                  </div>
                  <p className="my-booking-reference">Reservation {reservation.id}</p>
                  {reservation.status === "Confirmed"
                    && reservation.paymentStatus === "Success"
                    && balanceDue > 0 && (
                      <button
                        type="button"
                        className="my-booking-pay-balance"
                        disabled={Boolean(balancePaymentId) || Boolean(cancellingId)}
                        onClick={() => payRemainingBalance(reservation)}
                      >
                        {balancePaymentId === reservation.id
                          ? "Opening secure checkout…"
                          : `Pay remaining balance · ₹${formatCurrency(balanceDue)}`}
                      </button>
                  )}
                  {reservation.canCancelFree && reservation.balancePaymentInProgress && (
                    <p className="my-booking-cancellation-note">Close or complete the balance checkout before cancelling this booking.</p>
                  )}
                  {reservation.status === "Cancelled"
                    && reservation.paymentStatus === "Failed"
                    && !reservation.refundId && (
                      <button
                        type="button"
                        className="my-booking-reconcile"
                        disabled={Boolean(reconcilingId)}
                        onClick={() => reconcilePayment(reservation.id)}
                      >
                        {reconcilingId === reservation.id ? "Checking Razorpay…" : "Check test payment & confirm booking"}
                      </button>
                  )}
                  {reservation.status === "Confirmed"
                    && reservation.paymentStatus === "Success"
                    && (
                      <>
                        {reservation.confirmationEmailSent && (
                          <p className="my-booking-reference">
                            Email provider accepted the confirmation. If it is not in your inbox, check Spam or Promotions.
                          </p>
                        )}
                        <button
                          type="button"
                          className="my-booking-reconcile"
                          disabled={Boolean(emailRetryId)}
                          onClick={() => resendConfirmationEmail(reservation.id)}
                        >
                          {emailRetryId === reservation.id
                            ? "Sending email…"
                            : reservation.confirmationEmailSent
                              ? "Resend booking confirmation email"
                              : "Send booking confirmation email"}
                        </button>
                      </>
                  )}
                  {reservation.refundId && <p className="my-booking-reference">Test payment refund reference {reservation.refundId}</p>}
                  {reservation.canCancelFree && !reservation.balancePaymentInProgress && (
                    <div className="my-booking-cancellation">
                      <p>Free cancellation with a full refund of the amount paid until {formatStayDate(reservation.freeCancellationUntil)} (one day before check-in).</p>
                      <button
                        type="button"
                        className="my-booking-cancel"
                        disabled={Boolean(cancellingId)}
                        onClick={() => cancelBooking(reservation.id, hotel?.hotelName || "this stay", amountPaid)}
                      >
                        {cancellingId === reservation.id ? "Processing refund…" : "Cancel booking · refund amount paid"}
                      </button>
                    </div>
                  )}
                  {reservation.status === "CancellationPending" && (
                    <div className="my-booking-cancellation">
                      <p>{reservation.cancellationInitiatedBy === "hotelAdmin"
                        ? `${hotel?.hotelName || "The hotel"} cancelled this reservation. Your refund is being processed automatically; you do not need to check its status.`
                        : "Your booking is cancelled. The refund is being processed automatically; you do not need to check its status."}</p>
                    </div>
                  )}
                  {reservation.status === "Cancelled" && reservation.refundStatus === "Processed" && (
                    <div className="my-booking-cancellation">
                      {reservation.cancellationInitiatedBy === "hotelAdmin" && (
                        <p>{hotel?.hotelName || "The hotel"} cancelled this booking. ₹{formatCurrency(amountPaid)} was refunded.</p>
                      )}
                      {reservation.cancellationEmailSent ? (
                        <p>The cancellation and refund confirmation email was accepted by the email provider.</p>
                      ) : (
                        <p>The booking is cancelled and the amount paid was fully refunded. The cancellation email could not be delivered.</p>
                      )}
                    </div>
                  )}
                  {reservation.status === "Confirmed"
                    && reservation.paymentStatus === "Success"
                    && !reservation.canCancelFree
                    && !reservation.refundId && (
                      <p className="my-booking-cancellation-note">
                        Free cancellation is available only until one day before check-in. The cancellation window for this stay has closed.
                      </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <p className="my-bookings-disclaimer">Hotel details, rates, and room availability are illustrative demo data. Razorpay Test Mode payments do not charge real money.</p>
      </section>
    </main>
  );
}
