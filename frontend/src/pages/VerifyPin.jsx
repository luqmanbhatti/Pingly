import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { sendEmailVerification, reload } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/useAuth";

export default function VerifyPin() {
  const { firebaseUser, profile } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!firebaseUser) {
      navigate("/login", { replace: true });
    } else if (profile?.emailVerified) {
      navigate("/setup", { replace: true });
    }
  }, [firebaseUser, profile, navigate]);

  async function handleCheck() {
    setError("");
    setBusy(true);
    try {
      // Firebase's own emailVerified flag only updates locally after reload().
      await reload(firebaseUser);
      if (firebaseUser.emailVerified) {
        await setDoc(doc(db, "users", firebaseUser.uid), { emailVerified: true }, { merge: true });
        navigate("/setup");
      } else {
        setError("Not verified yet — check your inbox (and spam folder) and click the link, then try again.");
      }
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setBusy(true);
    setError("");
    setResent(false);
    try {
      await sendEmailVerification(firebaseUser);
      setResent(true);
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">Pingly</div>
      <p style={{ fontSize: 14, color: "var(--ig-gray-text)" }}>
        We sent a verification link to <strong>{firebaseUser?.email}</strong>. Click the link in
        that email, then come back here and press Continue.
      </p>
      {error && <p style={{ color: "var(--ig-red)", fontSize: 13 }}>{error}</p>}
      {resent && <p style={{ color: "green", fontSize: 13 }}>Verification email resent!</p>}
      <button className="btn-gradient" style={{ width: "100%" }} onClick={handleCheck} disabled={busy}>
        {busy ? "Checking…" : "Continue"}
      </button>
      <button
        onClick={handleResend}
        disabled={busy}
        style={{ background: "none", border: "none", color: "var(--ig-blue)", marginTop: 16, cursor: "pointer" }}
      >
        Resend verification email
      </button>
    </div>
  );
}
