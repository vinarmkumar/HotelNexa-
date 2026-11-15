import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Mail } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../../api.js";
import PasswordRequirements from "./PasswordRequirements.jsx";
import { isPasswordValid } from "../passwordPolicy.js";
import GoogleAutoSignin from "../../Googleautosignin/GoogleAutoSignin.jsx";
import { getSafeStayReturnUrl } from "../../HomePage/staySearchUrl.js";

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = getSafeStayReturnUrl(location.search);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [emailOtp, setEmailOtp] = useState("");
  const [step, setStep] = useState("details");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signUpWithGoogle(credential) {
    setBusy(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/google", { method: "POST", body: { credential } });
      navigate(returnTo);
    } catch (error) {
      setMessage(error.message);
      setSuccess(false);
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const data = await apiRequest("/api/auth/signup", { method: "POST", body: form });
      setStep("verify");
      setMessage(data.message);
      setSuccess(true);
    } catch (error) {
      setMessage(error.message);
      setSuccess(false);
    } finally {
      setBusy(false);
    }
  }

  async function verifyAccount(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: { email: form.email, emailOtp },
      });
      navigate(returnTo);
    } catch (error) {
      setMessage(error.message);
      setSuccess(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page signup-page">
      <Link to="/" className="back-home"><ArrowLeft size={17} /> Back to HotelNexa</Link>
      <section className="auth-layout signup-layout">
        <div className="auth-visual signup-visual">
          <div className="signup-visual-inner">
            <span className="visual-tag">YOUR STAY, YOUR STORY <span className="green-text">✳</span></span>
            <div className="door-mark" aria-hidden="true"><span>H</span><i /></div>
            <p className="signup-visual-caption">One account.<br /><strong>A thousand ways to unwind.</strong></p>
            <div className="signup-benefits">
              <span><Check size={14} /> Keep every booking close</span>
              <span><Check size={14} /> Get a little more personal</span>
            </div>
          </div>
        </div>
        <div className="auth-panel signup-panel">
          <Link className="wordmark" to="/" aria-label="HotelNexa home">HOTEL<span>NEXA</span><i>®</i></Link>
          <div className="form-wrap">
            <div className="form-kicker"><span className="kicker-line" /> {step === "details" ? "YOUR INVITATION" : "ONE LAST STEP"} <span className="kicker-line" /></div>
            <h2>{step === "details" ? "Make yourself\nat home." : "Verify your\nemail address."}</h2>
            <p className="form-intro">{step === "details" ? "Create your guest account. It only takes a moment." : "Enter the email code to finish creating your account."}</p>
            {step === "details" ? (
              <>
              <form className="auth-form signup-form" onSubmit={submitDetails}>
                <label>Full name<input className="plain-input" autoComplete="name" maxLength={80} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" /></label>
                <label>Email address<span className="input-shell"><Mail size={17} /><input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></span></label>
                <label>Phone number<input className="plain-input" type="tel" autoComplete="tel" maxLength={25} required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" /></label>
                <label>Create password<span className="input-shell"><LockKeyhole size={17} /><input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Example: Campus@123" /></span></label>
                <PasswordRequirements password={form.password} />
                {message && <div className={`form-message ${success ? "is-success" : ""}`} role="status">{message}</div>}
                <button className="submit-button" type="submit" disabled={busy || !isPasswordValid(form.password)}>{busy ? "Sending email code..." : "Create account & send email code"} {!busy && <ArrowRight size={17} />}</button>
              </form>
              <div className="auth-divider"><span /> OR <span /></div>
              <GoogleAutoSignin onCredential={signUpWithGoogle} onError={(error) => { setMessage(error.message); setSuccess(false); }} />
              </>
            ) : (
              <form className="auth-form signup-form" onSubmit={verifyAccount}>
                <label>Email verification code<span className="input-shell otp-shell"><Mail size={17} /><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={emailOtp} onChange={(event) => setEmailOtp(event.target.value.replace(/\D/g, ""))} placeholder="6-digit email code" /></span></label>
                <p className="microcopy">Your email code is valid for 10 minutes. Check spam if needed.</p>
                {message && <div className={`form-message ${success ? "is-success" : ""}`} role="status">{message}</div>}
                <button className="submit-button" type="submit" disabled={busy || emailOtp.length !== 6}>{busy ? "Verifying..." : "Verify & continue"} {!busy && <ArrowRight size={17} />}</button>
                <button type="button" className="text-button back-action" onClick={() => { setStep("details"); setMessage(""); setEmailOtp(""); }}>Change account details</button>
              </form>
            )}
            <p className="account-switch">Already have an account? <Link to={`/signin?returnTo=${encodeURIComponent(returnTo)}`}>Sign in <ArrowRight size={14} /></Link></p>
            <div className="privacy-note"><LockKeyhole size={15} /><span>Your account is created after email verification. Your phone helps the hotel contact you about your reservation.</span></div>
          </div>
          <footer className="auth-footer"><span>© 2026 HotelNexa</span><span>GUEST ACCOUNT · NO ADMIN SIGNUP</span></footer>
        </div>
      </section>
    </main>
  );
}
