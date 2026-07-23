import { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err) {
      // Firebase deliberately doesn't reveal whether the email exists (to
      // prevent account enumeration) -- errors here are mostly malformed
      // input, not "not found".
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">Pingly</div>
      {sent ? (
        <p style={{ fontSize: 14, color: "var(--ig-gray-text)" }}>
          If an account exists for <strong>{email}</strong>, a password reset link has been sent.
          Check your inbox (and spam folder).
        </p>
      ) : (
        <>
          <p style={{ fontSize: 14, color: "var(--ig-gray-text)" }}>
            Enter your account's email and we'll send you a link to reset your password.
          </p>
          <form onSubmit={handleSubmit}>
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p style={{ color: "var(--ig-red)", fontSize: 13 }}>{error}</p>}
            <button className="btn-primary" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <p style={{ marginTop: 20, fontSize: 14 }}>
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}
