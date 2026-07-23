import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { firebaseConfig } from "./firebaseConfig";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

// Calls our Vercel serverless functions in /api instead of Firebase Cloud
// Functions (those require the paid Blaze plan; this doesn't).
// Same call shape as httpsCallable so the rest of the app doesn't need to change.
async function callApi(name, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  // Force-refresh so claims like email_verified are current (they're cached
  // in the token otherwise and can be up to an hour stale).
  const idToken = await user.getIdToken(true);

  const res = await fetch(`/api/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(data),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Request to ${name} failed`);
  }
  return json;
}

export const claimUsernameFn = ({ username }) => callApi("claimUsername", { username });
