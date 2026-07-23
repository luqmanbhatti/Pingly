import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), {
        email,
        createdAt: serverTimestamp(),
      });
      // Firebase sends this itself (its own infra, no Resend/domain needed).
      await sendEmailVerification(cred.user);
      navigate("/verify");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError(
          "That email is already registered. Try logging in, or use \"Forgot password\" if you don't remember your password."
        );
      } else {
        setError(err.message.replace("Firebase: ", ""));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">Pingly</div>
      <form onSubmit={handleSubmit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {error && <p style={{ color: "var(--ig-red)", fontSize: 13 }}>{error}</p>}
        <button className="btn-gradient" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p style={{ marginTop: 20, fontSize: 14 }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
