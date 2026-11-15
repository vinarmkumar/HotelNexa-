import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Ban,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Hotel,
  History,
  LogOut,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import { formatCurrency, formatStayDate, formatStayTimestamp } from "../utils/stayFormatting.js";
import PasswordRequirements from "../SigninSignup/Components/PasswordRequirements.jsx";
import { isPasswordValid } from "../SigninSignup/passwordPolicy.js";
import "./hotelAdminDashboard.css";

function getBookingStatus(status) {
  if (status === "Confirmed") return "Confirmed";
  if (status === "CheckedIn") return "Checked in";
  if (status === "CheckedOut") return "Checked out";
  if (status === "CancellationPending") return "Cancelled · refund processing";
  if (status === "Cancelled") return "Cancelled";
  return status;
}

function getTodayInIndia() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getRoomTypePayload(form, includeBedCount = false) {
  const data = new FormData(form);
  return {
    name: data.get("name"),
    ...(includeBedCount ? { bedCount: Number(data.get("bedCount")) } : {}),
    capacity: Number(data.get("capacity")),
    nightlyRate: Number(data.get("nightlyRate")),
    advanceAmount: Number(data.get("advanceAmount")),
    amenities: data.getAll("amenities"),
    isActive: data.get("isActive") === "on",
  };
}

export default function HotelAdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [overview, setOverview] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [inventoryStatus, setInventoryStatus] = useState("idle");
  const [status, setStatus] = useState("checking");
  const [activeTab, setActiveTab] = useState("reservations");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [updatingReservationId, setUpdatingReservationId] = useState("");
  const [savingInventory, setSavingInventory] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const lastLoadedQuery = useRef("");
  const hasPendingCancellation = Boolean(overview?.bookings?.some((booking) => booking.status === "CancellationPending"));

  const loadOverview = useCallback(async (requestedPage = 1, requestedSearch = "", force = false) => {
    const queryKey = `${requestedPage}|${requestedSearch}`;
    if (!force && lastLoadedQuery.current === queryKey) return;
    lastLoadedQuery.current = queryKey;
    setStatus("loading");
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(requestedPage),
        pageSize: "20",
        search: requestedSearch,
      });
      const data = await apiRequest(`/api/reservations/hotel-admin/overview?${query}`);
      setOverview(data);
      setStatus("ready");
    } catch (requestError) {
      if (requestError.status === 401) {
        navigate("/signin", { replace: true });
        return;
      }
      setError(requestError.message || "Hotel guest and reservation data could not be loaded.");
      setStatus("error");
    }
  }, [navigate]);

  const loadInventory = useCallback(async () => {
    try {
      const data = await apiRequest("/api/reservations/hotel-admin/rooms");
      setInventory(data);
      setInventoryStatus("ready");
    } catch (requestError) {
      setError(requestError.message || "Room inventory could not be loaded.");
      setInventoryStatus("error");
    }
  }, []);

  function selectTab(tab) {
    setActiveTab(tab);
    if (tab === "rooms" || tab === "activity") void loadInventory();
  }

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/me")
      .then(async (data) => {
        if (!active) return;
        if (data.user.role !== "hotelAdmin") {
          navigate(data.user.role === "admin" || data.user.role === "staff" ? "/admin" : "/signin", { replace: true });
          return;
        }
        setUser(data.user);
        if (data.user.mustChangePassword) {
          setStatus("password");
          return;
        }
        await loadOverview(1, "");
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError.status === 401) {
          navigate("/signin", { replace: true });
          return;
        }
        setError(requestError.message || "Hotel administrator access could not be verified.");
        setStatus("error");
      });
    return () => { active = false; };
  }, [loadOverview, navigate]);

  useEffect(() => {
    if (status !== "ready") return undefined;
    const queryKey = `${page}|${search.trim()}`;
    if (lastLoadedQuery.current === queryKey) return undefined;
    const timer = setTimeout(() => {
      void loadOverview(page, search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [loadOverview, page, search, status]);

  useEffect(() => {
    if (!hasPendingCancellation) return undefined;
    let active = true;
    const timer = setInterval(() => {
      const query = new URLSearchParams({ page: String(page), pageSize: "20", search: search.trim() });
      apiRequest(`/api/reservations/hotel-admin/overview?${query}`)
        .then((data) => { if (active) setOverview(data); })
        .catch((requestError) => {
          if (active) setError(requestError.message || "Refund status could not be refreshed.");
        });
    }, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hasPendingCancellation, page, search]);

  async function changePassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setError("Choose a password that meets all the listed requirements.");
      return;
    }

    setPasswordBusy(true);
    try {
      const data = await apiRequest("/api/auth/hotel-admin/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setUser(data.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated. Your hotel operations dashboard is ready.");
      await loadOverview(page, search.trim(), true);
    } catch (requestError) {
      setError(requestError.message || "Your password could not be updated.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await apiRequest("/api/auth/signout", { method: "POST" });
      navigate("/signin", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  async function cancelBooking(booking) {
    const confirmed = window.confirm(
      `Cancel reservation ${booking.id} for ${booking.guestName}? Razorpay will refund ₹${formatCurrency(booking.amountPaid)} already paid.`,
    );
    if (!confirmed) return;
    setCancellingId(booking.id);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest(`/api/reservations/hotel-admin/${booking.id}/cancel-booking`, { method: "POST" });
      setMessage(result.message);
      await loadOverview(page, search.trim(), true);
    } catch (requestError) {
      setError(requestError.message || "The reservation could not be cancelled.");
    } finally {
      setCancellingId("");
    }
  }

  async function updateStayStatus(booking, action) {
      setUpdatingReservationId(booking.id);
      setError("");
      setMessage("");
      try {
        const result = await apiRequest(`/api/reservations/hotel-admin/${booking.id}/stay-status`, {
          method: "POST",
          body: { action },
        });
        setMessage(`Reservation ${booking.id} is now ${getBookingStatus(result.reservation.status).toLowerCase()}.`);
        await loadOverview(page, search.trim(), true);
      } catch (requestError) {
        setError(requestError.message || "The reservation stay status could not be updated.");
      } finally {
        setUpdatingReservationId("");
      }
  }

  async function submitRoomType(event, roomTypeId = "") {
      event.preventDefault();
      const form = event.currentTarget;
      setSavingInventory(true);
      setError("");
      setMessage("");
      try {
        const body = getRoomTypePayload(form, !roomTypeId);
        const result = await apiRequest(
          roomTypeId
            ? `/api/reservations/hotel-admin/room-types/${roomTypeId}`
            : "/api/reservations/hotel-admin/room-types",
          { method: roomTypeId ? "PATCH" : "POST", body },
        );
        setMessage(roomTypeId ? "Room type updated." : "Room type created.");
        await loadInventory();
        if (!roomTypeId) form.reset();
        return result;
      } catch (requestError) {
        setError(requestError.message || "The room type could not be saved.");
        return null;
      } finally {
        setSavingInventory(false);
      }
  }

  async function createRoom(roomTypeId) {
      const roomNumber = newRoomNumber.trim();
      if (!roomNumber) {
        setError("Enter a room number before adding the room.");
        return;
      }
      setSavingInventory(true);
      setError("");
      setMessage("");
      try {
        await apiRequest(`/api/reservations/hotel-admin/room-types/${roomTypeId}/rooms`, {
          method: "POST",
          body: { roomNumber },
        });
        setNewRoomNumber("");
        setMessage(`Room ${roomNumber} added.`);
        await loadInventory();
      } catch (requestError) {
        setError(requestError.message || "The room could not be added.");
      } finally {
        setSavingInventory(false);
      }
  }

  async function updateRoom(room, status) {
      setSavingInventory(true);
      setError("");
      setMessage("");
      try {
        await apiRequest(`/api/reservations/hotel-admin/rooms/${room._id}`, {
          method: "PATCH",
          body: { status },
        });
        setMessage(`Room ${room.roomNumber} marked ${status === "Available" ? "available" : "out of service"}.`);
        await loadInventory();
      } catch (requestError) {
        setError(requestError.message || "The room status could not be updated.");
      } finally {
        setSavingInventory(false);
    }
  }

  const bookings = useMemo(() => overview?.bookings || [], [overview]);
  const cancellationHistory = useMemo(() => overview?.cancellationHistory || [], [overview]);
  const visibleBookings = bookings;
  const guests = overview?.guests || [];
  const today = getTodayInIndia();
  const visibleGuests = search.trim()
    ? guests.filter((guest) => `${guest.name} ${guest.email}`.toLowerCase().includes(search.trim().toLowerCase()))
    : guests;

  return (
    <main className="hotel-admin-page">
      <header className="hotel-admin-topbar">
        <Link className="hotel-admin-brand" to="/">HOTEL<span>NEXA</span></Link>
        <div className="hotel-admin-top-actions">
          <Link to="/" className="hotel-admin-site-link">View website <ArrowUpRight size={14} /></Link>
          <button type="button" onClick={signOut} disabled={signingOut}><LogOut size={14} /> {signingOut ? "Signing out…" : "Sign out"}</button>
        </div>
      </header>

      <div className="hotel-admin-content">
        {status === "checking" && <p className="hotel-admin-state">Verifying hotel account…</p>}
        {status === "password" && (
          <section className="hotel-admin-password-card">
            <p className="hotel-admin-eyebrow"><ShieldCheck size={14} /> FIRST SIGN-IN SECURITY</p>
            <h1>Set your hotel<br /><em>account password.</em></h1>
            <p className="hotel-admin-subtitle">For {user?.name}, sign in with the one-time password from your local provisioning credentials, then choose a new password. This step is required before viewing guest information.</p>
            <form className="hotel-admin-password-form" onSubmit={changePassword}>
              <label>Temporary password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
              <label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
              <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
              <PasswordRequirements password={newPassword} />
              {error && <p className="hotel-admin-error" role="alert">{error}</p>}
              <button type="submit" disabled={passwordBusy || !isPasswordValid(newPassword) || newPassword !== confirmPassword}>
                {passwordBusy ? "Updating password…" : "Set password and continue"}
              </button>
            </form>
          </section>
        )}
        {status === "loading" && <p className="hotel-admin-state">Loading your hotel’s guest and reservation records…</p>}
        {status === "error" && (
          <div className="hotel-admin-error-panel" role="alert">
            <CircleAlert size={18} /><p>{error}</p>
            <button type="button" onClick={() => loadOverview(page, search.trim(), true)}>Try again</button>
          </div>
        )}
        {status === "ready" && overview && (
          <>
            <section className="hotel-admin-heading">
              <div>
                <p className="hotel-admin-eyebrow"><Hotel size={14} /> PROPERTY OPERATIONS / {overview.hotel.name.toUpperCase()}</p>
                <h1>Your guests,<br /><em>your hotel.</em></h1>
                <p className="hotel-admin-subtitle">Review your property’s HotelNexa reservations and contact guests directly.</p>
              </div>
              <span className="hotel-admin-demo-label">HOTEL-SCOPED ACCESS</span>
            </section>

            {message && <p className="hotel-admin-success" role="status">{message}</p>}
            <section className="hotel-admin-metrics" aria-label="Hotel summary">
              <article><span>CONFIRMED BOOKINGS</span><strong>{overview.summary.confirmedBookings}</strong></article>
              <article><span>UNIQUE GUESTS</span><strong>{overview.summary.uniqueGuests}</strong></article>
              <article><span>TEST PAYMENTS RECEIVED</span><strong>₹{Number(overview.summary.revenueINR).toLocaleString("en-IN")}</strong></article>
            </section>

            <section className="hotel-admin-records">
              <div className="hotel-admin-records-heading">
                <div>
                  <p className="hotel-admin-eyebrow"><Users size={14} /> GUEST SERVICES</p>
                  <h2>Reservations & guests</h2>
                </div>
                <label className="hotel-admin-search"><Search size={15} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search guest or reservation" /></label>
              </div>
              <div className="hotel-admin-tabs" role="tablist" aria-label="Hotel records">
                <button type="button" role="tab" aria-selected={activeTab === "reservations"} className={activeTab === "reservations" ? "is-active" : ""} onClick={() => selectTab("reservations")}><CalendarDays size={14} /> Reservations</button>
                <button type="button" role="tab" aria-selected={activeTab === "guests"} className={activeTab === "guests" ? "is-active" : ""} onClick={() => selectTab("guests")}><Users size={14} /> Guests</button>
                <button type="button" role="tab" aria-selected={activeTab === "cancellations"} className={activeTab === "cancellations" ? "is-active" : ""} onClick={() => selectTab("cancellations")}><History size={14} /> Cancellations ({cancellationHistory.length})</button>
                <button type="button" role="tab" aria-selected={activeTab === "rooms"} className={activeTab === "rooms" ? "is-active" : ""} onClick={() => selectTab("rooms")}><BedDouble size={14} /> Rooms & rates</button>
                <button type="button" role="tab" aria-selected={activeTab === "activity"} className={activeTab === "activity" ? "is-active" : ""} onClick={() => selectTab("activity")}><ShieldCheck size={14} /> Activity</button>
              </div>
              {activeTab === "rooms" ? (
                !inventory && inventoryStatus !== "error" ? (
                  <p className="hotel-admin-state" role="status">Loading rooms and rates…</p>
                ) : inventoryStatus === "error" ? (
                  <p className="hotel-admin-error" role="alert">{error}</p>
                ) : inventory ? (
                  <div className="hotel-admin-inventory">
                    <section className="hotel-admin-inventory-create">
                      <div><p className="hotel-admin-eyebrow"><BedDouble size={14} /> ROOM TYPES</p><h3>Create a room type</h3></div>
                      <form className="hotel-admin-room-type-form" onSubmit={(event) => submitRoomType(event)}>
                        <label>Name<input name="name" required maxLength={80} placeholder="e.g. Deluxe twin" /></label>
                        <label>Beds<select name="bedCount" defaultValue="1">{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
                        <label>Guest capacity<input name="capacity" type="number" min="1" max="20" defaultValue="1" required /></label>
                        <label>Nightly rate (₹)<input name="nightlyRate" type="number" min="2" max="100000" defaultValue="1200" required /></label>
                        <label>Advance (₹)<input name="advanceAmount" type="number" min="1" max="99999" defaultValue="500" required /></label>
                        <div className="hotel-admin-amenity-options">
                          {["Wi-Fi", "Breakfast", "Air conditioning", "Private bathroom"].map((amenity) => (
                            <label key={amenity}><input type="checkbox" name="amenities" value={amenity} defaultChecked={amenity !== "Breakfast"} />{amenity}</label>
                          ))}
                          <label><input type="checkbox" name="isActive" defaultChecked /> Available for new bookings</label>
                        </div>
                        <button type="submit" disabled={savingInventory}><Plus size={14} /> Create room type</button>
                      </form>
                    </section>
                    {(inventory.roomTypes || []).map((roomType) => (
                      <article className="hotel-admin-room-type" key={roomType._id}>
                        <form onSubmit={(event) => submitRoomType(event, roomType._id)}>
                          <div className="hotel-admin-room-type-heading">
                            <div><span className="hotel-admin-eyebrow">ROOM TYPE · {roomType.bedCount} {roomType.bedCount === 1 ? "BED" : "BEDS"}</span><h3>{roomType.name}</h3></div>
                            <label className="hotel-admin-active-toggle"><input type="checkbox" name="isActive" defaultChecked={roomType.isActive} /> Available for new bookings</label>
                          </div>
                          <div className="hotel-admin-room-type-fields">
                            <label>Name<input name="name" defaultValue={roomType.name} required maxLength={80} /></label>
                            <label>Guest capacity<input name="capacity" type="number" min={roomType.bedCount} max="20" defaultValue={roomType.capacity} required /></label>
                            <label>Nightly rate (₹)<input name="nightlyRate" type="number" min="2" max="100000" defaultValue={roomType.nightlyRate} required /></label>
                            <label>Advance (₹)<input name="advanceAmount" type="number" min="1" max={roomType.nightlyRate - 1} defaultValue={roomType.advanceAmount} required /></label>
                          </div>
                          <div className="hotel-admin-amenity-options">
                            {["Wi-Fi", "Breakfast", "Air conditioning", "Heating", "Television", "Refrigerator", "Private bathroom", "Balcony", "Workspace", "Parking", "Restaurant", "Pool"].map((amenity) => (
                              <label key={amenity}><input type="checkbox" name="amenities" value={amenity} defaultChecked={roomType.amenities.includes(amenity)} />{amenity}</label>
                            ))}
                          </div>
                          <button type="submit" disabled={savingInventory}><ShieldCheck size={14} /> Save room type</button>
                        </form>
                        <div className="hotel-admin-room-list">
                          <div><strong>Individual rooms</strong><span>{inventory.rooms.filter((room) => String(room.roomTypeId) === String(roomType._id)).length} total</span></div>
                          {inventory.rooms.filter((room) => String(room.roomTypeId) === String(roomType._id)).map((room) => (
                            <article className="hotel-admin-room-row" key={room._id}>
                              <span>Room {room.roomNumber} · <strong className={`hotel-admin-room-status status-${room.status.toLowerCase()}`}>{room.status === "Available" ? "Available" : room.status === "Occupied" ? "Occupied" : "Out of service"}</strong></span>
                              {room.status !== "Occupied" && (
                                <button type="button" disabled={savingInventory} onClick={() => updateRoom(room, room.status === "Available" ? "OutOfService" : "Available")}>
                                  {room.status === "Available" ? "Take out of service" : "Set available"}
                                </button>
                              )}
                            </article>
                          ))}
                          <div className="hotel-admin-add-room">
                            <label>New room number<input value={newRoomNumber} onChange={(event) => setNewRoomNumber(event.target.value)} maxLength={30} /></label>
                            <button type="button" disabled={savingInventory} onClick={() => createRoom(roomType._id)}><Plus size={14} /> Add room</button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <p className="hotel-admin-empty">No room inventory is configured. Run the room seed command first.</p>
              ) : activeTab === "activity" ? (
                !inventory && inventoryStatus !== "error" ? <p className="hotel-admin-state" role="status">Loading hotel activity…</p> : (
                  <div className="hotel-admin-activity-list">
                    {(inventory?.activity || []).length ? inventory.activity.map((entry) => (
                      <article className="hotel-admin-activity" key={entry._id}>
                        <div><strong>{entry.action.replaceAll(".", " ")}</strong><span>{entry.actorName} · {entry.entityType} {entry.entityId}</span></div>
                        <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-IN")}</time>
                      </article>
                    )) : <p className="hotel-admin-empty">No room or stay-status changes recorded yet.</p>}
                  </div>
                )
              ) : activeTab === "reservations" ? (
                visibleBookings.length ? (
                  <>
                  <div className="hotel-admin-booking-list">
                    {visibleBookings.map((booking) => (
                      <article className="hotel-admin-booking" key={booking.id}>
                        <div className="hotel-admin-booking-top">
                          <div>
                            <h3>{booking.guestName}</h3>
                            <span>{booking.guestEmail || "Guest email unavailable"}{booking.guestPhone ? ` · ${booking.guestPhone}` : " · Phone not provided"}</span>
                          </div>
                          <span className={`hotel-admin-booking-status status-${booking.status.toLowerCase()}`}>{getBookingStatus(booking.status)}</span>
                        </div>
                        <div className="hotel-admin-booking-details">
                          <span><small>CHECK-IN</small><strong>{formatStayDate(booking.checkIn)}</strong></span>
                          <span><small>CHECK-OUT</small><strong>{formatStayDate(booking.checkOut)}</strong></span>
                          <span><small>ROOM / GUESTS</small><strong>{booking.roomNumber ? `Room ${booking.roomNumber} · ` : ""}{booking.bedCount} {booking.bedCount === 1 ? "bed" : "beds"} · {booking.guestCount} guests</strong></span>
                          <span><small>PAYMENT</small><strong>{booking.paymentType} · ₹{formatCurrency(booking.amountPaid)} paid</strong></span>
                        </div>
                        {(booking.checkedInAt || booking.checkedOutAt) && (
                          <div className="hotel-admin-stay-timestamps">
                            {booking.checkedInAt && <span>Actual check-in: <time dateTime={booking.checkedInAt}>{formatStayTimestamp(booking.checkedInAt)}</time></span>}
                            {booking.checkedOutAt && <span>Actual check-out: <time dateTime={booking.checkedOutAt}>{formatStayTimestamp(booking.checkedOutAt)}</time></span>}
                          </div>
                        )}
                        <div className="hotel-admin-booking-footer">
                          <span>
                            Reservation {booking.id} · Total ₹{formatCurrency(booking.totalAmount)}
                            {booking.balanceTransactionId ? ` · Balance payment ${booking.balanceTransactionId}` : ""}
                            {booking.refundId ? ` · Refund ${booking.refundId}` : ""}
                          </span>
                          {booking.status === "Confirmed" && booking.balanceDue > 0 && (
                            <strong className="hotel-admin-balance-due">
                              <CircleAlert size={13} /> PENDING ₹{formatCurrency(booking.balanceDue)}
                            </strong>
                          )}
                          {booking.guestEmail && <a href={`mailto:${encodeURIComponent(booking.guestEmail)}?subject=${encodeURIComponent(`Hotel booking ${booking.id}`)}`}><Mail size={13} /> Contact guest</a>}
                        </div>
                        {booking.status === "Confirmed" && booking.paymentStatus === "Success" && booking.amountPaid > 0 && !booking.balancePaymentInProgress && (
                          <button
                            type="button"
                            className="hotel-admin-cancel-booking"
                            disabled={Boolean(cancellingId)}
                            onClick={() => cancelBooking(booking)}
                          >
                            <Ban size={14} /> {cancellingId === booking.id ? "Processing refund…" : `Cancel booking · refund ₹${formatCurrency(booking.amountPaid)}`}
                          </button>
                        )}
                        {booking.balancePaymentInProgress && (
                          <p className="hotel-admin-balance-note">The guest has an active balance checkout; close or complete it before cancelling this reservation.</p>
                        )}
                        {booking.status === "Confirmed" && today >= booking.checkIn && today < booking.checkOut && (
                          <button type="button" className="hotel-admin-stay-action" disabled={Boolean(updatingReservationId)} onClick={() => updateStayStatus(booking, "check-in")}>
                            {updatingReservationId === booking.id ? "Updating stay…" : "Check in guest"}
                          </button>
                        )}
                        {booking.status === "CheckedIn" && (
                          <button type="button" className="hotel-admin-stay-action" disabled={Boolean(updatingReservationId)} onClick={() => updateStayStatus(booking, "check-out")}>
                            {updatingReservationId === booking.id ? "Updating stay…" : "Check out guest"}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                  <div className="hotel-admin-pagination">
                    <span>{overview.pagination.total ? `Page ${overview.pagination.page} of ${overview.pagination.totalPages} · ${overview.pagination.total} reservations` : "No reservations"}</span>
                    <div>
                      <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} /> Previous</button>
                      <button type="button" disabled={page >= overview.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight size={15} /></button>
                    </div>
                  </div>
                  </>
                ) : <p className="hotel-admin-empty">No reservations match this search.</p>
              ) : activeTab === "guests" ? visibleGuests.length ? (
                <div className="hotel-admin-guest-list">
                  {visibleGuests.map((guest) => (
                    <article className="hotel-admin-guest" key={guest.email}>
                      <span className="hotel-admin-guest-icon"><Users size={16} /></span>
                      <div><strong>{guest.name}</strong><span>{guest.email} {guest.phone ? `· ${guest.phone}` : "· Phone not provided"}</span></div>
                      <small>{guest.bookings} {guest.bookings === 1 ? "reservation" : "reservations"} · latest check-in {formatStayDate(guest.latestCheckIn)}</small>
                      <a href={`mailto:${encodeURIComponent(guest.email)}?subject=${encodeURIComponent(`Your ${overview.hotel.name} reservation`)}`} aria-label={`Email ${guest.name}`}><Mail size={15} /></a>
                    </article>
                  ))}
                </div>
              ) : <p className="hotel-admin-empty">No guest records match this search.</p> : cancellationHistory.length ? (
                <div className="hotel-admin-booking-list">
                  {cancellationHistory.map((booking) => (
                    <article className="hotel-admin-booking" key={booking.id}>
                      <div className="hotel-admin-booking-top">
                        <div>
                          <h3>{booking.guestName} · Reservation {booking.id}</h3>
                          <span>{booking.guestEmail} {booking.guestPhone ? `· ${booking.guestPhone}` : ""}</span>
                        </div>
                        <span className={`hotel-admin-booking-status status-${String(booking.refundStatus || "NotStarted").toLowerCase()}`}>{booking.status === "Cancelled" ? "Cancelled" : "Cancelled · refund processing"}</span>
                      </div>
                      <div className="hotel-admin-booking-details">
                        <span><small>STAY</small><strong>{formatStayDate(booking.checkIn)} – {formatStayDate(booking.checkOut)}</strong></span>
                        <span><small>ROOM</small><strong>{booking.bedCount} {booking.bedCount === 1 ? "bed" : "beds"}</strong></span>
                        <span><small>REFUNDED / PAID</small><strong>₹{formatCurrency(booking.amountPaid)}</strong></span>
                        <span><small>REFUND REFERENCE</small><strong>{booking.refundId || "Not issued"}</strong></span>
                      </div>
                      <div className="hotel-admin-booking-footer">
                        <span>{booking.cancellationInitiatedBy === "hotelAdmin" ? `Cancelled by ${booking.cancellationActorName || "hotel administrator"}` : "Cancelled by guest"} · {booking.cancellationReason || "No reason recorded"}</span>
                        {booking.guestEmail && <a href={`mailto:${encodeURIComponent(booking.guestEmail)}?subject=${encodeURIComponent(`Cancellation for reservation ${booking.id}`)}`}><Mail size={13} /> Contact guest</a>}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="hotel-admin-empty">No cancellations recorded for this property.</p>}
            </section>
            <p className="hotel-admin-disclaimer">HotelNexa reservations currently use demo inventory and Razorpay Test Mode. This dashboard only displays bookings assigned to this property.</p>
          </>
        )}
      </div>
    </main>
  );
}
