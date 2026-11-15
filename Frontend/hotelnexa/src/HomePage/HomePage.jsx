import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, LogOut, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api.js";
import StayDiscovery from "./StayDiscovery.jsx";
import homeArtwork from "./img/HomePagebg.png";
import logo from "./img/WebsiteLogo.png";

export default function HomePage() {
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  function scrollToStays(event) {
    event.preventDefault();
    document.getElementById("stay-discovery")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    apiRequest("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch((error) => {
        setUser(null);
        if (error.status !== 401) setNotice("We couldn’t verify your session. Some account features may be unavailable.");
      })
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiRequest("/api/auth/signout", { method: "POST" });
      setUser(null);
      setNotice("");
    } catch (error) {
      setNotice(error.message || "Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="home-page" style={{ "--home-art": `url("${homeArtwork}")` }}>
      <header className="site-header">
        <div className="header-side">
          {user ? (
            <Link className="header-link" to="/my-bookings">MY BOOKINGS <span className="header-arrow">↗</span></Link>
          ) : (
            <>
              <Link className="header-link header-signin-link" to="/signin">SIGN IN</Link>
              <Link className="header-link" to="/my-bookings">MY BOOKINGS <span className="header-arrow">↗</span></Link>
            </>
          )}
        </div>
        <Link className="logo-link" to="/" aria-label="HotelNexa home"><img src={logo} alt="HotelNexa — Next-Gen AI Stays" /></Link>
        <div className="header-side header-side-right">
          {user?.role === "hotelAdmin" && <Link className="header-booking admin-nav-link" to="/hotel-admin">HOTEL ADMIN <ArrowRight size={14} /></Link>}
          {["staff", "admin"].includes(user?.role) && <Link className="header-booking admin-nav-link" to="/admin">OPERATIONS <ArrowRight size={14} /></Link>}
          {user ? (
            <>
              <span className="user-greeting">HELLO, {user.name.split(" ")[0].toUpperCase()}</span>
              <button className="header-signout" type="button" onClick={signOut} disabled={signingOut}>
                <LogOut size={13} /> {signingOut ? "SIGNING OUT…" : "SIGN OUT"}
              </button>
            </>
          ) : <Link className="header-booking" to="/signup">JOIN NEXA <ArrowRight size={14} /></Link>}
          <button className="mobile-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        {menuOpen && <nav className="mobile-nav">
          {user?.role === "hotelAdmin" && <Link to="/hotel-admin" onClick={() => setMenuOpen(false)}>Back to hotel admin</Link>}
          {["staff", "admin"].includes(user?.role) && <Link to="/admin" onClick={() => setMenuOpen(false)}>Operations dashboard</Link>}
          <Link to="/my-bookings" onClick={() => setMenuOpen(false)}>My bookings</Link>
          {user ? <button disabled={signingOut} onClick={() => { setMenuOpen(false); signOut(); }}>{signingOut ? "Signing out…" : "Sign out"}</button> : <><Link to="/signin" onClick={() => setMenuOpen(false)}>Sign in</Link><Link to="/signup" onClick={() => setMenuOpen(false)}>Create an account</Link></>}
        </nav>}
      </header>
      {notice && <p className="site-notice" role="status">{notice}</p>}

      <section className="hero" aria-label="Welcome to HotelNexa">
        <div className="hero-backdrop" />
        <div className="hero-meta"><span><i className="live-dot" /> OPEN THE DOOR TO SOMEWHERE ELSE</span><span>EST. FOR THE CURIOUS · 2026</span></div>
        <div className="hero-copy">
          <p className="hero-kicker">A NEW CHAPTER IN CHECKING IN</p>
          <h1>Stay a little<br /><em>extraordinary.</em></h1>
          <p className="hero-description">Not just a room for the night. A place that feels like part of the story.</p>
          {user?.role === "admin" ? (
            <Link className="hero-cta" to="/admin"><span>OPEN ADMIN CONSOLE</span><ArrowRight size={18} /></Link>
          ) : user ? (
            <a className="hero-cta" href="#stay-discovery" onClick={scrollToStays}><span>EXPLORE HOTELNEXA</span><ArrowRight size={18} /></a>
          ) : (
            <Link className="hero-cta" to="/signup"><span>CREATE YOUR ACCOUNT</span><ArrowRight size={18} /></Link>
          )}
          <div className="hero-note"><span className="note-line" /> YOUR STAY, REIMAGINED</div>
        </div>
        <a className="scroll-cue" href="#stay-discovery"><span>SCROLL TO DISCOVER</span><ArrowDown size={16} /></a>
        <div className="hero-side-note">A LITTLE LESS ORDINARY <span>✳</span> A LOT MORE YOU</div>
      </section>

      <StayDiscovery />

      <section className="manifesto" id="manifesto">
        <div className="manifesto-label"><span className="live-dot" /> THE HOTELNEXA WAY</div>
        <div className="manifesto-content">
          <p>Arrive as you are.<br /><span>Leave with a story.</span></p>
          <div className="manifesto-detail"><span>01 — MADE FOR MOMENTS</span><p>Considered spaces, thoughtful touches, and stays that feel like they were made for you.</p><Link to={user ? "/signin" : "/signup"}>STEP INSIDE <ArrowRight size={14} /></Link></div>
        </div>
        <div className="manifesto-index">HN / 001</div>
      </section>

      <footer className="site-footer"><span>HOTELNEXA © 2026</span><span>STAY DIFFERENT <b>✳</b></span><Link to="/signin">MEMBER ACCESS ↗</Link></footer>
    </main>
  );
}
