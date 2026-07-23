import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/useAuth";
import { watchPresence } from "../lib/presence";
import Avatar from "../components/Avatar";

const TYPING_TIMEOUT_MS = 3000;

export default function ChatWindow() {
  const { chatId } = useParams();
  const { firebaseUser, profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [other, setOther] = useState(null);
  const [otherPresence, setOtherPresence] = useState(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const navigate = useNavigate();

  // Load the other participant's profile for the header.
  useEffect(() => {
    (async () => {
      const chatSnap = await getDoc(doc(db, "chats", chatId));
      if (!chatSnap.exists()) return;
      const otherUid = chatSnap.data().participants.find((p) => p !== firebaseUser.uid);
      const userSnap = await getDoc(doc(db, "users", otherUid));
      if (userSnap.exists()) setOther({ uid: otherUid, ...userSnap.data() });
    })();
  }, [chatId, firebaseUser]);

  // Being on this screen means any unread count for me on this chat is stale —
  // clear it immediately (Instagram-style "opened it, so it's read now").
  useEffect(() => {
    updateDoc(doc(db, "chats", chatId), {
      [`unread.${firebaseUser.uid}`]: 0,
      [`hiddenFor.${firebaseUser.uid}`]: false,
    }).catch(() => {});
  }, [chatId, firebaseUser]);

  // Online/offline status for the other participant.
  useEffect(() => {
    if (!other?.uid) return;
    return watchPresence(other.uid, setOtherPresence);
  }, [other?.uid]);

  // Listen for messages, mark incoming ones as read.
  useEffect(() => {
    setMessagesLoading(true);
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("sentAt", "asc"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(list);
      setMessagesLoading(false);

      list
        .filter((m) => m.senderId !== firebaseUser.uid && m.status !== "read")
        .forEach((m) => {
          updateDoc(doc(db, "chats", chatId, "messages", m.id), { status: "read" });
        });

      updateDoc(doc(db, "chats", chatId), { [`unread.${firebaseUser.uid}`]: 0 }).catch(() => {});

      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [chatId, firebaseUser]);

  // Listen to the other participant's typing state, stored on the chat doc.
  useEffect(() => {
    if (!other?.uid) return;
    return onSnapshot(doc(db, "chats", chatId), (snap) => {
      const typingMap = snap.data()?.typing || {};
      const lastTyped = typingMap[other.uid];
      setOtherTyping(Boolean(lastTyped) && Date.now() - lastTyped < TYPING_TIMEOUT_MS);
    });
  }, [chatId, other?.uid]);

  function handleTextChange(e) {
    setText(e.target.value);
    updateDoc(doc(db, "chats", chatId), { [`typing.${firebaseUser.uid}`]: Date.now() }).catch(() => {});
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      updateDoc(doc(db, "chats", chatId), { [`typing.${firebaseUser.uid}`]: null }).catch(() => {});
    }, TYPING_TIMEOUT_MS);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || messagingDisabled) return;
    const body = text.trim();
    setText("");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    updateDoc(doc(db, "chats", chatId), { [`typing.${firebaseUser.uid}`]: null }).catch(() => {});

    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: firebaseUser.uid,
      text: body,
      sentAt: serverTimestamp(),
      status: "sent",
    });

    await updateDoc(doc(db, "chats", chatId), {
      lastMessage: body,
      lastMessageAt: serverTimestamp(),
      lastMessageSender: firebaseUser.uid,
      ...(other?.uid ? { [`unread.${other.uid}`]: increment(1) } : {}),
      ...(other?.uid ? { [`hiddenFor.${other.uid}`]: false } : {}),
      [`unread.${firebaseUser.uid}`]: 0,
      [`hiddenFor.${firebaseUser.uid}`]: false,
    });
  }

  function startCall(type) {
    // callId shared by both participants for this chat + type
    const callId = `${chatId}_${type}_${Date.now()}`;
    navigate(`/call/${callId}?to=${other?.uid}&type=${type}&role=caller`);
  }

  const iBlockedThem = Boolean(profile?.blockedUsers?.[other?.uid]);
  const theyBlockedMe = Boolean(other?.blockedUsers?.[firebaseUser.uid]);
  const messagingDisabled = iBlockedThem || theyBlockedMe;

  return (
    <div className="chat-window">
      <div className="chat-header" onClick={() => other?.uid && navigate(`/profile/${other.uid}`)}>
        <button
          className="back-button"
          onClick={(e) => {
            e.stopPropagation();
            navigate("/");
          }}
          aria-label="Back to chats"
        >
          ←
        </button>
        <Avatar seed={other?.uid} photoURL={other?.photoURL} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{other?.fullName || "…"}</div>
          <div style={{ fontSize: 12, color: "var(--ig-gray-text)" }}>
            {otherTyping ? (
              <span style={{ color: "var(--ig-blue)" }}>typing…</span>
            ) : otherPresence?.state === "online" ? (
              "Online"
            ) : (
              `@${other?.username || ""}`
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            startCall("audio");
          }}
          className="btn-primary"
          style={{ marginRight: 8 }}
          disabled={messagingDisabled}
        >
          📞
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            startCall("video");
          }}
          className="btn-primary"
          disabled={messagingDisabled}
        >
          🎥
        </button>
      </div>

      <div className="messages">
        {messagesLoading ? (
          <div className="loading-dots" style={{ margin: "auto" }}>
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            {messages.map((m) => {
              const mine = m.senderId === firebaseUser.uid;
              return (
                <div key={m.id} className={`bubble ${mine ? "mine" : "theirs"}`}>
                  {m.text}
                  {mine && (
                    <span className={`tick ${m.status === "read" ? "read" : "sent"}`}>
                      {m.status === "read" ? " ✓✓" : m.status === "delivered" ? " ✓✓" : " ✓"}
                    </span>
                  )}
                </div>
              );
            })}
            {otherTyping && (
              <div className="bubble theirs typing-bubble">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {messagingDisabled && (
        <div className="blocked-banner">
          {iBlockedThem
            ? "You've blocked this person. Unblock them from their profile to send messages."
            : "You can't message this person right now."}
        </div>
      )}

      <form className="composer" onSubmit={sendMessage}>
        <input
          placeholder="Message…"
          value={text}
          onChange={handleTextChange}
          disabled={messagingDisabled}
        />
        <button className="btn-gradient" type="submit" disabled={messagingDisabled}>
          Send
        </button>
      </form>
    </div>
  );
}
