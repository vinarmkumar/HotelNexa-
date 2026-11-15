import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  ChartNoAxesCombined,
  CircleAlert,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import "./adminDashboard.css";

function getDateOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "rooms", label: "Rooms & rates", icon: BedDouble },
  { id: "reservations", label: "Reservations", icon: CalendarDays },
  { id: "guests", label: "Guests", icon: Users },
  { id: "reports", label: "Reports", icon: ChartNoAxesCombined },
];

const sectionContent = {
  rooms: {
    title: "Rooms & rates",
    description: "Create room types, manage room availability, and configure nightly rates.",
  },
  reservations: {
    title: "Reservations",
    description: "Guest test reservations are available through the checkout and booking-history flow.",
  },
  guests: {
    title: "Guest records",
    description: "View guest profiles and their reservation history.",
  },
  reports: {
    title: "Operations reports",
    description: "Review occupancy, arrivals, departures, and revenue for a selected date range.",
  },
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [reportDates, setReportDates] = useState(() => ({
    from: getDateOffset(-30),
    to: getDateOffset(0),
  }));
  const [appliedReportDates, setAppliedReportDates] = useState(reportDates);
  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState("idle");
  const [reportError, setReportError] = useState("");
  const [reportReload, setReportReload] = useState(0);

  useEffect(() => {
    apiRequest("/api/auth/me")
      .then((data) => {
        if (!["staff", "admin"].includes(data.user.role)) {
          navigate("/signin", { replace: true });
          return;
        }
        setUser(data.user);
        if (data.user.role === "staff") setActiveSection("reports");
        setStatus("verified");
      })
      .catch((error) => {
        if (error.status === 401 || error.status === 403) {
          navigate("/signin", { replace: true });
          return;
        }
        setMessage(error.message || "Administrator access could not be verified.");
        setStatus("error");
      });
  }, [navigate]);

  useEffect(() => {
    if (status !== "verified" || activeSection !== "reports") return undefined;
    let active = true;
    const query = new URLSearchParams(appliedReportDates);
    apiRequest(`/api/reservations/admin/reports?${query}`)
      .then((data) => {
        if (active) {
          setReport(data);
          setReportStatus("ready");
        }
      })
      .catch((error) => {
        if (active) {
          setReportError(error.message || "Reports could not be loaded.");
          setReportStatus("error");
        }
      });
    return () => { active = false; };
  }, [status, activeSection, appliedReportDates, reportReload]);

  async function signOut() {
    setSigningOut(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/signout", { method: "POST" });
      navigate("/signin", { replace: true });
    } catch (error) {
      setMessage(error.message || "Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  function selectSection(sectionId) {
    if (sectionId === "reports") {
      setReportStatus("loading");
      setReportError("");
    }
    setActiveSection(sectionId);
    setMenuOpen(false);
  }

  const activeContent = sectionContent[activeSection];
  const visibleSections = user?.role === "staff"
    ? sections.filter((section) => section.id === "reports")
    : sections;

  return (
    <main className="admin-dashboard">
      <header className="dashboard-topbar">
        <Link className="dashboard-brand" to="/">HOTEL<span>NEXA</span><i>®</i></Link>
        <div className="dashboard-top-actions">
          <Link to="/" className="dashboard-home-link">View website <ArrowUpRight size={15} /></Link>
          <button type="button" className="dashboard-signout" onClick={signOut} disabled={signingOut}>
            <LogOut size={15} /> {signingOut ? "Signing out..." : "Sign out"}
          </button>
          <button type="button" className="dashboard-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close dashboard menu" : "Open dashboard menu"}>
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className={`dashboard-sidebar${menuOpen ? " is-open" : ""}`}>
          <p className="dashboard-nav-label">HOTEL OPERATIONS</p>
          <nav aria-label="Admin dashboard">
            {visibleSections.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={`dashboard-nav-item${activeSection === id ? " is-active" : ""}`}
                onClick={() => selectSection(id)}
              >
                <Icon size={17} /> <span>{label}</span>
                {activeSection === id && <span className="dashboard-nav-marker" />}
              </button>
            ))}
          </nav>
          <div className="dashboard-sidebar-note">
            <span className="dashboard-secure-icon"><CircleAlert size={16} /></span>
            <p>Staff/admin access is verified by the HotelNexa server.</p>
          </div>
        </aside>

        <section className="dashboard-main">
          {status === "checking" && <div className="dashboard-status">Verifying staff/admin access...</div>}
          {status === "error" && <div className="dashboard-alert" role="alert">{message}</div>}
          {status === "verified" && activeSection === "reports" ? (
            <section className="dashboard-reports">
              <div className="dashboard-heading">
                <div>
                  <p className="dashboard-eyebrow"><span className="live-dot" /> HOTELNEXA / REPORTS</p>
                  <h1>Revenue &<br /><em>occupancy.</em></h1>
                  <p className="dashboard-subtitle">Confirmed Test Mode revenue and arrivals use check-in dates; occupancy and booked room-nights use stay dates in the selected range.</p>
                </div>
                <span className="dashboard-date">TEST BOOKINGS ONLY</span>
              </div>
              <form className="dashboard-report-form" onSubmit={(event) => {
                event.preventDefault();
                setReportStatus("loading");
                setReportError("");
                setAppliedReportDates(reportDates);
                setReportReload((count) => count + 1);
              }}>
                <label>From<input type="date" value={reportDates.from} max={reportDates.to} onChange={(event) => setReportDates({ ...reportDates, from: event.target.value })} /></label>
                <label>To<input type="date" value={reportDates.to} min={reportDates.from} onChange={(event) => setReportDates({ ...reportDates, to: event.target.value })} /></label>
                <button type="submit">Update report</button>
              </form>
              {(reportStatus === "loading" || reportStatus === "idle") && <p className="dashboard-status" role="status">Loading report…</p>}
              {reportStatus === "error" && <div className="dashboard-alert" role="alert">{reportError}</div>}
              {reportStatus === "ready" && report && (
                <>
                  <div className="dashboard-report-metrics">
                    <article><span>CONFIRMED BOOKINGS</span><strong>{report.summary.confirmedBookings}</strong></article>
                    <article><span>TEST REVENUE</span><strong>₹{Number(report.summary.revenueINR).toLocaleString("en-IN")}</strong></article>
                    <article><span>BOOKED ROOM-NIGHTS</span><strong>{report.summary.bookedRoomNights}</strong></article>
                  </div>
                  <div className="dashboard-report-table-wrap">
                    <div className="dashboard-report-table-heading"><h2>Daily room occupancy</h2><span>Booked demo rooms per night</span></div>
                    {report.dailyOccupancy.length ? (
                      <table className="dashboard-report-table">
                        <thead><tr><th>Date</th><th>Booked rooms</th></tr></thead>
                        <tbody>{report.dailyOccupancy.map((day) => (
                          <tr key={day.date}><td>{new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td><td>{day.occupiedRooms}</td></tr>
                        ))}</tbody>
                      </table>
                    ) : <p className="dashboard-report-empty">No confirmed room-nights in this date range.</p>}
                  </div>
                  <div className="dashboard-arrivals-grid">
                    {[["Upcoming arrivals", report.arrivals], ["Upcoming departures", report.departures]].map(([title, entries]) => (
                      <div className="dashboard-report-table-wrap" key={title}>
                        <div className="dashboard-report-table-heading"><h2>{title}</h2><span>Reservations by date</span></div>
                        {entries.length ? (
                          <table className="dashboard-report-table">
                            <thead><tr><th>Date</th><th>Reservations</th></tr></thead>
                            <tbody>{entries.map((entry) => (
                              <tr key={entry.date}><td>{new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td><td>{entry.count}</td></tr>
                            ))}</tbody>
                          </table>
                        ) : <p className="dashboard-report-empty">No arrivals or departures in this range.</p>}
                      </div>
                    ))}
                  </div>
                  <p className="dashboard-report-disclaimer">Each hotel starts with one demo room per bed type; hotel admins can add rooms. These figures are for sandbox evaluation only, not live operations or real revenue.</p>
                </>
              )}
            </section>
          ) : status === "verified" && (
            activeSection === "overview" ? (
              <>
                <div className="dashboard-heading">
                  <div>
                    <p className="dashboard-eyebrow"><span className="live-dot" /> HOTELNEXA / ADMIN</p>
                    <h1>Operations<br /><em>dashboard.</em></h1>
                    <p className="dashboard-subtitle">Your control room for the guest experience.</p>
                  </div>
                  <span className="dashboard-date">PROPERTY MANAGEMENT</span>
                </div>

                <div className="dashboard-notice" role="status">
                  <CircleAlert size={19} />
                  <div>
                    <strong>Payments and reporting use demo inventory only</strong>
                    <p>Guest test reservations are verified server-side and reports are available to staff/admin. The directory is illustrative and does not connect to live room inventory or real payment processing.</p>
                  </div>
                </div>

                <div className="dashboard-section-heading">
                  <div><span>01</span><h2>Management areas</h2></div>
                  <p>Choose an area to see its current setup status.</p>
                </div>

                <div className="dashboard-module-grid">
                  {sections.slice(1).map(({ id, label, icon: Icon }, index) => (
                    <button className="dashboard-module-card" type="button" key={id} onClick={() => selectSection(id)}>
                      <span className="dashboard-module-index">0{index + 1} / 04</span>
                      <Icon size={22} />
                      <strong>{label}</strong>
                      <span className="dashboard-module-status">{id === "reports" ? "Connected · test data" : id === "reservations" ? "Test checkout active" : "Not connected"} <ArrowUpRight size={14} /></span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="dashboard-module-view">
                <p className="dashboard-eyebrow"><span className="live-dot" /> HOTELNEXA / ADMIN</p>
                <span className="dashboard-module-view-icon">
                  {(() => {
                    const Icon = sections.find((section) => section.id === activeSection)?.icon || LayoutDashboard;
                    return <Icon size={25} />;
                  })()}
                </span>
                <h1>{activeContent.title}</h1>
                <p>{activeContent.description}</p>
                <div className="dashboard-notice" role="status">
                  <CircleAlert size={19} />
                  <div>
                    <strong>This management area is not available yet</strong>
                    <p>Live inventory and guest operations are not connected. Confirmed test-payment revenue and demo occupancy are available in Reports.</p>
                  </div>
                </div>
                <button type="button" className="dashboard-back-button" onClick={() => selectSection("overview")}>Back to overview</button>
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
}
