import admin from "./firebaseAdmin.js";

// Reads the Firebase ID token from the Authorization: Bearer <token> header
// and verifies it server-side. Throws a 401 error if missing/invalid.
export default async function verifyAuth(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error("You must be signed in.");
    err.statusCode = 401;
    throw err;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (e) {
    const err = new Error("Invalid or expired session. Please log in again.");
    err.statusCode = 401;
    throw err;
  }
}
