import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/useAuth";
import Avatar from "../components/Avatar";

const STATUS_LABEL = {
  completed: "Completed",
  missed: "Missed",
  declined: "Declined",
  cancelled: "Cancelled",
  calling: "Calling…",
};

function formatWhen(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

export default function CallHistory() {
  const { firebaseUser } = useAuth();
  const [calls, setCalls] = useState([]);
  const [otherUsers, setOtherUsers] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, "callLogs"),
      where("participants", "array-contains", firebaseUser.uid),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, async (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCalls(list);

      const missing = list
        .map((c) => c.participants.find((p) => p !== firebaseUser.uid))
        .filter((uid) => uid && !otherUsers[uid]);
      const fetched = {};
      await Promise.all(
        missing.map(async (uid) => {
          const s = await getDoc(doc(db, "users", uid));
          if (s.exists()) fetched[uid] = s.data();
        })
      );
      if (Object.keys(fetched).length) setOtherUsers((prev) => ({ ...prev, ...fetched }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  if (!calls.length) {
    return (
      <div className="chat-list-scroll">
        <div className="chat-placeholder">No calls yet. Start one from any chat.</div>
      </div>
    );
  }

  return (
    <div className="chat-list-scroll">
      {calls.map((call) => {
        const otherUid = call.participants.find((p) => p !== firebaseUser.uid);
        const other = otherUsers[otherUid];
        const outgoing = call.callerId === firebaseUser.uid;
        const missed = call.status === "missed" || call.status === "declined";
        // chatId is the two uids joined by "_" in sorted order (matches ChatSidebar's chatIdFor).
        const chatId = [firebaseUser.uid, otherUid].sort().join("_");

        return (
          <div
            className="call-history-item chat-list-item"
            key={call.id}
            onClick={() => navigate(`/chat/${chatId}`)}
          >
            <Avatar seed={otherUid} photoURL={other?.photoURL} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{other?.fullName || "…"}</div>
              <div className={`call-direction ${missed ? "missed" : "ok"}`}>
                {outgoing ? "Outgoing" : "Incoming"} {call.type === "video" ? "video" : "voice"} ·{" "}
                {STATUS_LABEL[call.status] || call.status} · {formatWhen(call.createdAt)}
              </div>
            </div>
            <button
              className="call-history-icon"
              title={`Call ${other?.fullName || ""} again`}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/call/${chatId}_${call.type}_${Date.now()}?to=${otherUid}&type=${call.type}&role=caller`);
              }}
            >
              {call.type === "video" ? "🎥" : "📞"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
