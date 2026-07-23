import admin from "./_lib/firebaseAdmin.js";
import verifyAuth from "./_lib/verifyAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyAuth(req);
    const uid = decoded.uid;
    let { username } = req.body || {};

    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username required." });
    }
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
      return res.status(400).json({
        error: "Username must be 3-20 characters: lowercase letters, numbers, . or _",
      });
    }

    // Check the real email_verified claim from the verified ID token (set
    // by Firebase Auth itself), not the Firestore field -- the Firestore
    // field is client-writable for UI convenience, so it can't be trusted
    // for this authorization check.
    if (decoded.email_verified !== true) {
      return res.status(412).json({ error: "Verify your email before choosing a username." });
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);

    const usernameRef = db.collection("usernames").doc(username);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(usernameRef);
      if (existing.exists) {
        const err = new Error("That username is taken.");
        err.statusCode = 409;
        throw err;
      }
      tx.set(usernameRef, { uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.set(userRef, { username }, { merge: true });
    });

    return res.status(200).json({ claimed: true, username });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}
