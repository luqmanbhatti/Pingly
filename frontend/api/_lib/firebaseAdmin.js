import admin from "firebase-admin";

// FIREBASE_SERVICE_ACCOUNT_B64 = base64-encoded JSON of your service account key.
// Set this in Vercel -> Project Settings -> Environment Variables (and locally in .env).
if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_B64 env var. Set it in your .env file (local) or Vercel project settings (deployed)."
    );
  }
  const serviceAccount = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
