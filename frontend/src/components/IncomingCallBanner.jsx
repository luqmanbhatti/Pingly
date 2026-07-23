import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ref, onValue, remove, update, off } from "firebase/database";
import { doc, getDoc } from "firebase/firestore";
import { rtdb, db } from "../lib/firebase";
import { useAuth } from "../lib/useAuth";
import Avatar from "./Avatar";
import { startRingtone, stopRingtone } from "../lib/sound";

// Listens on incomingCalls/{myUid} for a new call pointer written by a
// caller's CallScreen, and shows a WhatsApp-style incoming call bar with
// Accept/Decline. Mount this once near the top of the app (inside the
// authenticated area) so it can appear over whatever screen the user is on.
export default function IncomingCallBanner() {
  const { firebaseUser } = useAuth();
  const [incoming, setIncoming] = useState(null); // { callId, callerId, type, callerName }
  const navigate = useNavigate();

  useEffect(() => {
    if (!firebaseUser) return;
    const myIncomingRef = ref(rtdb, `incomingCalls/${firebaseUser.uid}`);

    const unsubscribe = onValue(myIncomingRef, async (snap) => {
      const data = snap.val();
      if (!data) {
        setIncoming(null);
        stopRingtone();
        return;
      }
      // There should only ever be one active incoming call at a time in
      // this simple model; take the first entry.
      const [callId, call] = Object.entries(data)[0];
      const callerSnap = await getDoc(doc(db, "users", call.callerId));
      const callerName = callerSnap.exists() ? callerSnap.data().fullName : "Someone";
      setIncoming({
        callId,
        callerId: call.callerId,
        type: call.type,
        callerName,
        callerPhoto: callerSnap.exists() ? callerSnap.data().photoURL : null,
      });
      startRingtone();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`${callerName} is calling…`, {
            body: call.type === "video" ? "Incoming video call" : "Incoming voice call",
          });
        } catch {
          // Ignore — the on-screen banner + ringtone still work.
        }
      }
    });

    return () => {
      off(myIncomingRef);
      unsubscribe();
      stopRingtone();
    };
  }, [firebaseUser]);

  async function accept() {
    if (!incoming) return;
    stopRingtone();
    const { callId, callerId, type } = incoming;
    setIncoming(null);
    navigate(`/call/${callId}?to=${callerId}&type=${type}&role=callee`);
  }

  async function decline() {
    if (!incoming) return;
    stopRingtone();
    const { callId } = incoming;
    setIncoming(null);
    await update(ref(rtdb, `calls/${callId}`), { status: "declined" }).catch(() => {});
    await remove(ref(rtdb, `incomingCalls/${firebaseUser.uid}/${callId}`)).catch(() => {});
  }

  if (!incoming) return null;

  return (
    <div className="incoming-call-banner">
      <div className="incoming-call-info">
        <Avatar seed={incoming.callerId} photoURL={incoming.callerPhoto} size={40} />
        <div>
          <div style={{ fontWeight: 600 }}>{incoming.callerName}</div>
          <div style={{ fontSize: 12, color: "var(--ig-gray-text)" }}>
            Incoming {incoming.type} call…
          </div>
        </div>
      </div>
      <div className="incoming-call-actions">
        <button className="btn-primary" onClick={accept}>
          Accept
        </button>
        <button className="btn-decline" onClick={decline}>
          Decline
        </button>
      </div>
    </div>
  );
}
