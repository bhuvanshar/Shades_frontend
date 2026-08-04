import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import BrandWordmark from "../../components/BrandWordmark/BrandWordmark";
import { forgotPassword, resendVerification, resetPassword, verifyEmail } from "../../services/api";
import "./SignIn.css";

const SignIn = () => {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [googleStatus, setGoogleStatus] = useState("loading");
  const [submitting, setSubmitting] = useState(false);
  const { signIn, register, signInWithGoogle, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const resetToken = new URLSearchParams(location.search).get("resetToken") || "";
  const verifyToken = new URLSearchParams(location.search).get("verifyToken") || "";
  const registering = mode === "register";
  const googleButtonRef = useRef(null);
  const verificationStartedRef = useRef(false);
  const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID
    || "654177765040-742kbr08fgphkafqnkigb84jnj78o2nj.apps.googleusercontent.com";

  useEffect(() => { if (resetToken) setMode("reset"); }, [resetToken]);

  useEffect(() => {
    if (!verifyToken || verificationStartedRef.current) return undefined;
    verificationStartedRef.current = true;
    setMode("verify"); setError(""); setNotice(""); setSubmitting(true);
    verifyEmail(verifyToken)
      .then((response) => setNotice(response.message))
      .catch((err) => setError(err.message || "Unable to verify this email address."))
      .finally(() => setSubmitting(false));
    return undefined;
  }, [verifyToken]);

  useEffect(() => {
    const renderGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return false;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setError("");
          setSubmitting(true);
          try {
            await signInWithGoogle(credential);
            navigate("/", { replace: true });
          } catch (err) {
            setError(err.message || "Unable to continue with Google.");
          } finally {
            setSubmitting(false);
          }
        },
      });
      googleButtonRef.current.replaceChildren();
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard", theme: "outline", size: "large", shape: "rectangular",
        text: registering ? "signup_with" : "signin_with",
        width: Math.min(400, googleButtonRef.current.clientWidth || 400),
      });
      setGoogleStatus("ready");
      return true;
    };
    setGoogleStatus("loading");
    if (renderGoogleButton()) return undefined;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (renderGoogleButton()) window.clearInterval(timer);
      else if (attempts >= 50) {
        window.clearInterval(timer);
        setGoogleStatus("error");
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [googleClientId, navigate, registering, signInWithGoogle]);

  // Recovery links must remain usable even if this browser still has an
  // authenticated cookie. Otherwise opening the email redirects customers to
  // the storefront before the reset form can read its one-time token.
  if (isAuthenticated && !resetToken && !verifyToken) {
    return <Navigate to={isAdmin ? "/admin" : "/"} replace />;
  }

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (registering && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      if (registering) {
        const response = await register({ name, email, phoneNumber, password });
        setMode("signin"); setPassword(""); setConfirmPassword("");
        setNotice(response.message || "Account created. Check your email to verify your account.");
        return;
      }
      const user = await signIn(email, password);
      const requestedPath = location.state?.from?.pathname;
      navigate(user.roles?.includes("ADMIN") ? "/admin" : requestedPath || "/", { replace: true });
    } catch (err) {
      setError(err.message || (registering ? "Unable to create your account." : "Unable to sign in."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setError(""); setNotice("");
    if (!email.trim()) { setError("Enter your email address first."); return; }
    setSubmitting(true);
    try {
      const response = await resendVerification(email.trim().toLowerCase());
      setNotice(response.message);
    } catch (err) { setError(err.message || "Unable to send a verification email."); }
    finally { setSubmitting(false); }
  };

  const canSubmit = email && password && (!registering || (name.trim() && confirmPassword));

  const handleRecovery = async (event) => {
    event.preventDefault(); setError(""); setNotice(""); setSubmitting(true);
    try {
      if (mode === "forgot") {
        const response = await forgotPassword(email.trim().toLowerCase());
        setNotice(response.message);
      } else {
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        const response = await resetPassword(resetToken, password);
        setNotice(response.message);
        navigate("/signin", { replace: true });
        setTimeout(() => changeMode("signin"), 1200);
      }
    } catch (err) { setError(err.message || "Unable to reset your password."); }
    finally { setSubmitting(false); }
  };

  if (mode === "forgot" || mode === "reset" || mode === "verify") return (
    <main className="signin-page">
      <section className="signin-story" aria-label="Shades World introduction">
        <Link to="/" className="signin-brand"><BrandWordmark light /></Link>
        <div className="signin-story-copy"><span className="signin-eyebrow">{mode === "verify" ? "Secure email verification" : "Secure account recovery"}</span><h1>{mode === "verify" ? "Confirm the view is yours." : "A clear way back to your account."}</h1><p>{mode === "verify" ? "Verification links are private, expire after 24 hours and can only be used once." : "Reset links are private, expire after 30 minutes and can only be used once."}</p></div>
        <p className="signin-story-note">Shades World will never ask you to share a private account link.</p>
      </section>
      <section className="signin-panel"><div className="signin-card">
        <div className="signin-mobile-brand"><BrandWordmark /></div>
        <span className="signin-kicker">Account security</span>
        <h2>{mode === "forgot" ? "Forgot password" : mode === "verify" ? "Verify your email" : "Choose a new password"}</h2>
        <p className="signin-intro">{mode === "forgot" ? "Enter your account email and we’ll send you a secure reset link." : mode === "verify" ? "We are securely checking your one-time verification link." : "Use at least 8 characters for your new password."}</p>
        {mode === "verify" ? <div aria-live="polite">{submitting && <p>Verifying your email…</p>}{error && <div className="signin-error" role="alert">{error}</div>}{notice && <div className="signin-success" role="status">{notice}</div>}</div> : <form onSubmit={handleRecovery} noValidate>
          {error && <div className="signin-error" role="alert">{error}</div>}
          {notice && <div className="signin-success" role="status">{notice}</div>}
          {mode === "forgot" ? <><label htmlFor="recovery-email">Email address</label><input id="recovery-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength="255" required /></> : <>
            <label htmlFor="reset-password">New password</label><input id="reset-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength="8" maxLength="100" required />
            <label htmlFor="reset-confirm-password">Confirm new password</label><input id="reset-confirm-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength="8" maxLength="100" required />
            <button type="button" className="signin-link password-visibility" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide passwords" : "Show passwords"}</button>
          </>}
          <button className="signin-submit" type="submit" disabled={submitting || (mode === "forgot" ? !email : !password || !confirmPassword)}>{submitting ? "Please wait…" : mode === "forgot" ? "Send reset link" : "Reset password"}</button>
        </form>}
        <p className="signin-create"><button type="button" onClick={() => { navigate("/signin", { replace: true }); changeMode("signin"); }}>Back to sign in</button></p>
        <Link to="/" className="signin-back">← Continue shopping as a guest</Link>
      </div></section>
    </main>
  );

  return (
    <main className="signin-page">
      <section className="signin-story" aria-label="Shades World introduction">
        <Link to="/" className="signin-brand"><BrandWordmark light /></Link>
        <div className="signin-story-copy">
          <span className="signin-eyebrow">Designed for every point of view</span>
          <h1>{registering ? "Your view. Your account." : "Welcome back to a clearer world."}</h1>
          <p>{registering ? "Join Shades World to save favourites, shop faster and follow every order." : "Sign in to track orders, save your favourites and discover eyewear selected for you."}</p>
        </div>
        <p className="signin-story-note">Customers and store administrators use the same secure entrance.</p>
      </section>

      <section className="signin-panel">
        <div className="signin-card">
          <div className="signin-mobile-brand"><BrandWordmark /></div>
          <div className="signin-tabs" aria-label="Account access">
            <button type="button" aria-pressed={!registering} className={!registering ? "active" : ""} onClick={() => changeMode("signin")}>Sign in</button>
            <button type="button" aria-pressed={registering} className={registering ? "active" : ""} onClick={() => changeMode("register")}>Create account</button>
          </div>
          <span className="signin-kicker">{registering ? "Join Shades World" : "Your account"}</span>
          <h2>{registering ? "Create account" : "Sign in"}</h2>
          <p className="signin-intro">{registering ? "Create your customer account to shop, save favourites and track orders." : "Use the email and password associated with your Shades World account."}</p>

          <>
            <div className="signin-google" ref={googleButtonRef} aria-label="Continue with Google" />
            {googleStatus === "loading" && <p className="signin-google-status">Loading Google sign-in…</p>}
            {googleStatus === "error" && <p className="signin-google-status error">Google sign-in could not load. Disable blocking extensions and refresh.</p>}
            <div className="signin-divider"><span>or use email</span></div>
          </>

          <form onSubmit={handleSubmit} noValidate>
            {error && <div className="signin-error" role="alert">{error}</div>}
            {notice && <div className="signin-success" role="status">{notice}</div>}
            {registering && <>
              <label htmlFor="register-name">Full name</label>
              <input id="register-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your full name" maxLength="255" required />
            </>}
            <label htmlFor="signin-email">Email address</label>
            <input id="signin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" maxLength="255" required />

            <div className="signin-password-row">
              <label htmlFor="signin-password">Password</label>
              <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
            </div>
            <input id="signin-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={registering ? "new-password" : "current-password"} placeholder="Enter your password" minLength="8" maxLength="100" required />

            {registering && <>
              <p className="signin-password-hint">Use at least 8 characters.</p>
              <label htmlFor="register-confirm-password">Confirm password</label>
              <input id="register-confirm-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" placeholder="Enter your password again" minLength="8" maxLength="100" required />
              <label htmlFor="register-phone">Phone number <span className="signin-optional">Optional</span></label>
              <input id="register-phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} autoComplete="tel" placeholder="Your phone number" maxLength="20" />
            </>}

            {!registering && <div className="signin-options">
              <label className="signin-remember"><input type="checkbox" /> <span>Remember this device</span></label>
              <button type="button" className="signin-link" onClick={() => changeMode("forgot")}>Forgot password?</button>
            </div>}

            <button className="signin-submit" type="submit" disabled={submitting || !canSubmit}>
              {submitting ? (registering ? "Creating account..." : "Signing in...") : (registering ? "Create customer account" : "Continue")}
            </button>
          </form>
          {!registering && <p className="signin-create">Didn’t receive the verification email? <button type="button" disabled={submitting} onClick={handleResendVerification}>Resend verification</button></p>}
          <p className="signin-create">{registering ? "Already have an account?" : "New to Shades World?"} <button type="button" onClick={() => changeMode(registering ? "signin" : "register")}>{registering ? "Sign in" : "Create an account"}</button></p>
          <Link to="/" className="signin-back">← Continue shopping as a guest</Link>
        </div>
      </section>
    </main>
  );
};

export default SignIn;
