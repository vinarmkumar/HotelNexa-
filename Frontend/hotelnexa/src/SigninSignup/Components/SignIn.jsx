import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import authArtwork from "../Images/signinsignupbg.png";
import { apiRequest, waitForApiReady } from "../../api.js";
import PasswordRequirements from "./PasswordRequirements.jsx";
import { isPasswordValid } from "../passwordPolicy.js";
import GoogleAutoSignin from "../../Googleautosignin/GoogleAutoSignin.jsx";
import { getSafeStayReturnUrl } from "../../HomePage/staySearchUrl.js";

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = getSafeStayReturnUrl(location.search);
  const [step, setStep] = useState("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [adminLogin, setAdminLogin] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  function navigateAfterSignin(user) {
    if (user.role === "hotelAdmin") {
      navigate("/hotel-admin", { replace: true });
      return;
    }
    navigate(["staff", "admin"].includes(user.role) ? "/admin" : returnTo);
  }

  async function signInWithGoogle(credential) {
    setBusy(true);
    setMessage("");
    try {
      await waitForApiReady();
      const data = await apiRequest("/api/auth/google", { method: "POST", body: { credential } });
      navigateAfterSignin(data.user);
    } catch (error) {
      setMessage(error.message);
      setSuccess(false);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (step === "credentials") {
        await waitForApiReady();
        const data = await apiRequest("/api/auth/signin", {
          method: "POST",
          body: { email, password, adminLogin },
        });
        navigateAfterSignin(data.user);
      } else if (step === "forgot") {
        const data = await apiRequest("/api/auth/forgot-password", { method: "POST", body: { email } });
        setStep("reset");
        setMessage(data.message);
        setSuccess(true);
      } else {
        const data = await apiRequest("/api/auth/reset-password", {
          method: "POST",
          body: { email, otp, newPassword },
        });
        setStep("credentials");
        setPassword("");
        setOtp("");
        setNewPassword("");
        setMessage(data.message);
        setSuccess(true);
      }
    } catch (error) {
      setMessage(error.message);
      setSuccess(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="back-home"><ArrowLeft size={17} /> Back to HotelNexa</Link>
      <section className="auth-layout">
        <div className="auth-visual" style={{ backgroundImage: `linear-gradient(180deg,rgba(8,12,8,.06),rgba(8,12,8,.8)),url(${authArtwork})` }}>
          <div className="visual-top"><span className="eyebrow"><span className="live-dot" /> THE NEXA EXPERIENCE</span><span className="visual-index">01 / 03</span></div>
          <div className="visual-copy">
            <p className="eyebrow">A little magic. A lot of comfort.</p>
            <h1>Make room<br />for wonder.</h1>
            <p>Thoughtful stays for the stories you haven't told yet.</p>
          </div>
          <div className="visual-foot"><span>HOTELNEXA</span><span>STAY DIFFERENT <span className="green-text">✳</span></span></div>
        </div>

        <div className="auth-panel">
          <Link className="wordmark" to="/" aria-label="HotelNexa home">HOTEL<span>NEXA</span><i>®</i></Link>
          <div className="form-wrap">
            <div className="form-kicker"><span className="kicker-line" /> MEMBER ACCESS <span className="kicker-line" /></div>
            <h2>{step === "forgot" ? "Forgot password?" : step === "reset" ? "Reset password" : "Welcome back."}</h2>
            <p className="form-intro">{step === "credentials" ? "Sign in to pick up where your next escape begins." : step === "forgot" ? "We’ll send a reset code if your account exists." : "Enter your email code and choose a new password."}</p>

            <form onSubmit={submit} className="auth-form">
              {(step === "credentials" || step === "forgot") && (
                <label>Email address
                  <span className="input-shell"><Mail size={17} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></span>
                </label>
              )}
              {step === "credentials" && (
                <label>Password
                  <span className="input-shell"><KeyRound size={17} /><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></span>
                </label>
              )}
              {step === "reset" && <>
                <label>6-digit email code<input className="plain-input otp-field" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="000 000" /></label>
                <label>New password<input className="plain-input" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Example: Campus@123" /></label>
              </>}

              {step === "credentials" && <div className="form-options">
                <label className="check-label"><input type="checkbox" checked={adminLogin} onChange={(event) => setAdminLogin(event.target.checked)} /><span className="check-box"><Check size={12} /></span><span><ShieldCheck size={14} /> Hotel / administrator</span></label>
                <button type="button" className="text-button" onClick={() => { setStep("forgot"); setMessage(""); setSuccess(false); }}>Forgot password?</button>
              </div>}
              {step === "reset" && <PasswordRequirements password={newPassword} />}

              {message && <div className={`form-message ${success ? "is-success" : ""}`} role="status">{message}</div>}
              <button className="submit-button" type="submit" disabled={busy || (step === "reset" && (otp.length !== 6 || !isPasswordValid(newPassword)))}>
                {busy ? "One moment..." : step === "credentials" ? "Sign in" : step === "forgot" ? "Send reset code" : "Update password"}
                {!busy && <ArrowRight size={17} />}
              </button>
              {step !== "credentials" && <button className="text-button back-action" type="button" onClick={() => { setStep("credentials"); setMessage(""); setOtp(""); }}>Back to sign in</button>}
            </form>

            {step === "credentials" && <>
              <div className="auth-divider"><span /> OR <span /></div>
              <GoogleAutoSignin onCredential={signInWithGoogle} onError={(error) => { setMessage(error.message); setSuccess(false); }} />
            </>}
            {step === "credentials" && <p className="account-switch">New to HotelNexa? <Link to={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>Create an account <ArrowRight size={14} /></Link></p>}
            <div className="privacy-note"><ShieldCheck size={15} /><span>Your details are protected with secure, encrypted access.</span></div>
          </div>
          <footer className="auth-footer"><span>© 2026 HotelNexa</span><span>PRIVATE STAYS. PERSONAL STORIES.</span></footer>
        </div>
      </section>
    </main>
  );
}
