import { ref, onValue, onDisconnect, set, serverTimestamp } from "firebase/database";
import { rtdb } from "./firebase";

// Marks the given user online now, and automatically flips them to offline
// (with a last-seen timestamp) the moment their connection drops -- even on
// a crash or closed tab, since onDisconnect is registered server-side by
// the Realtime Database itself, not something our own code has to run.
export function startPresence(uid) {
  if (!uid) return () => {};

  const myStatusRef = ref(rtdb, `status/${uid}`);
  const connectedRef = ref(rtdb, ".info/connected");

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() === false) return;

    onDisconnect(myStatusRef)
      .set({ state: "offline", lastChanged: serverTimestamp() })
      .then(() => {
        set(myStatusRef, { state: "online", lastChanged: serverTimestamp() });
      });
  });

  return unsubscribe;
}

// Subscribe to another user's online/offline status.
// callback receives { state: "online" | "offline", lastChanged: number } | null
export function watchPresence(uid, callback) {
  if (!uid) return () => {};
  const statusRef = ref(rtdb, `status/${uid}`);
  return onValue(statusRef, (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
}
