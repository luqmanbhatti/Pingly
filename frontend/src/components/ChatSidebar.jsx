import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/useAuth";
import { useTheme } from "../lib/useTheme";
import { watchPresence } from "../lib/presence";
import { uploadProfilePicture } from "../lib/cloudinary";
import CallHistory from "../pages/CallHistory";
import Avatar from "./Avatar";
import ChatListSkeleton from "./ChatListSkeleton";
import { playMessageDing } from "../lib/sound";

function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

function PresenceDot({ uid }) {
  const [presence, setPresence] = useState(null);
  useEffect(() => watchPresence(uid, setPresence), [uid]);
  if (presence?.state !== "online") return null;
  return <span className="presence-dot" title="Online" />;
}

export default function ChatSidebar() {
  const { firebaseUser, profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { chatId: activeChatId } = useParams();
  const [chats, setChats] = useState([]);
  const [otherUsers, setOtherUsers] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [tab, setTab] = useState("chats"); // "chats" | "calls"
  const [pressedChatId, setPressedChatId] = useState(null); // long-press selected for delete
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const pressTimers = useRef({});
  const suppressClickRef = useRef(false);
  const LONG_PRESS_MS = 500;

  function startPress(chatId) {
    clearTimeout(pressTimers.current[chatId]);
    pressTimers.current[chatId] = setTimeout(() => {
      suppressClickRef.current = true;
      setPressedChatId(chatId);
      navigator.vibrate?.(25);
    }, LONG_PRESS_MS);
  }
  function cancelPress(chatId) {
    clearTimeout(pressTimers.current[chatId]);
  }

  // The chats onSnapshot listener below is set up once per login and needs
  // to know the *current* active chat / known-user-names without re-running
  // (which would drop and reattach the Firestore listener on every click).
  const activeChatIdRef = useRef(activeChatId);
  const otherUsersRef = useRef(otherUsers);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  useEffect(() => {
    otherUsersRef.current = otherUsers;
  }, [otherUsers]);

  // Ask for notification permission once, so new messages can raise a
  // native browser notification like Instagram/WhatsApp do.
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", firebaseUser.uid),
      orderBy("lastMessageAt", "desc")
    );

    let isFirstSnapshot = true;
    const lastSeenMillis = {}; // chatId -> lastMessageAt millis we've already reacted to

    return onSnapshot(q, async (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (!isFirstSnapshot) {
        for (const chat of list) {
          const curMillis = chat.lastMessageAt?.toMillis?.() ?? null;
          const isNewIncoming =
            curMillis &&
            curMillis !== lastSeenMillis[chat.id] &&
            chat.lastMessageSender &&
            chat.lastMessageSender !== firebaseUser.uid &&
            chat.id !== activeChatIdRef.current;

          if (isNewIncoming) {
            playMessageDing();
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              const otherUid = chat.participants.find((p) => p !== firebaseUser.uid);
              const otherName = otherUsersRef.current[otherUid]?.fullName || "New message";
              try {
                new Notification(otherName, { body: chat.lastMessage || "Sent you a message" });
              } catch {
                // Notification constructor can throw on some platforms (e.g. mobile Safari); ignore.
              }
            }
          }
        }
      }
      list.forEach((chat) => {
        lastSeenMillis[chat.id] = chat.lastMessageAt?.toMillis?.() ?? null;
      });
      isFirstSnapshot = false;

      setChats(list);

      const missing = list
        .map((c) => c.participants.find((p) => p !== firebaseUser.uid))
        .filter((uid) => uid && !otherUsers[uid]);
      const fetched = {};
      await Promise.all(
        missing.map(async (uid) => {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) fetched[uid] = snap.data();
        })
      );
      if (Object.keys(fetched).length) {
        setOtherUsers((prev) => ({ ...prev, ...fetched }));
      }
      setChatsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  // Instagram/WhatsApp-style tab title badge showing total unread count.
  useEffect(() => {
    if (!firebaseUser) return;
    const total = chats.reduce((sum, c) => sum + (c.unread?.[firebaseUser.uid] || 0), 0);
    document.title = total > 0 ? `(${total}) Pingly` : "Pingly";
  }, [chats, firebaseUser]);

  async function handleSearch(e) {
    e.preventDefault();
    setSearchError("");
    setSearchResult(null);
    const uname = searchTerm.trim().toLowerCase();
    if (!uname) return;
    setSearching(true);
    try {
      const usernameDoc = await getDoc(doc(db, "usernames", uname));
      if (!usernameDoc.exists()) {
        setSearchError("No user with that username.");
        return;
      }
      const targetUid = usernameDoc.data().uid;
      if (targetUid === firebaseUser.uid) {
        setSearchError("That's you!");
        return;
      }
      const userSnap = await getDoc(doc(db, "users", targetUid));
      setSearchResult({ uid: targetUid, ...userSnap.data() });
    } catch (err) {
      setSearchError(err.message.replace("Firebase: ", ""));
    } finally {
      setSearching(false);
    }
  }

  async function startChat(otherUid) {
    try {
      const otherSnap = await getDoc(doc(db, "users", otherUid));
      const otherData = otherSnap.exists() ? otherSnap.data() : {};
      if (profile?.blockedUsers?.[otherUid]) {
        setSearchError("You've blocked this person. Unblock them from their profile to chat.");
        return;
      }
      if (otherData.blockedUsers?.[firebaseUser.uid]) {
        setSearchError("You can't start a chat with this person right now.");
        return;
      }

      const chatId = chatIdFor(firebaseUser.uid, otherUid);
      const chatRef = doc(db, "chats", chatId);
      const existing = await getDoc(chatRef);
      if (!existing.exists()) {
        await setDoc(chatRef, {
          participants: [firebaseUser.uid, otherUid],
          lastMessage: "",
          lastMessageAt: serverTimestamp(),
          lastMessageSender: "",
        });
      }
      setSearchResult(null);
      setSearchTerm("");
      navigate(`/chat/${chatId}`);
    } catch (err) {
      setSearchError(`Couldn't start chat: ${err.message.replace("Firebase: ", "")}`);
    }
  }

  async function deleteChat(e, chatId) {
    e.stopPropagation();
    setPressedChatId(null);
    try {
      await setDoc(
        doc(db, "chats", chatId),
        { hiddenFor: { [firebaseUser.uid]: true } },
        { merge: true }
      );
      if (activeChatId === chatId) navigate("/");
    } catch (err) {
      alert(`Couldn't delete chat: ${err.message}`);
    }
  }

  async function handlePicChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPic(true);
    try {
      const photoURL = await uploadProfilePicture(file);
      await setDoc(doc(db, "users", firebaseUser.uid), { photoURL }, { merge: true });
    } catch (err) {
      alert(`Couldn't update profile picture: ${err.message}`);
    } finally {
      setUploadingPic(false);
      e.target.value = "";
    }
  }

  return (
    <div className="chat-list">
      <div style={{ padding: 16, borderBottom: "1px solid var(--ig-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            className="avatar-ring"
            onClick={() => fileInputRef.current?.click()}
            style={{ cursor: "pointer", opacity: uploadingPic ? 0.5 : 1, flexShrink: 0 }}
          >
            <Avatar
              seed={firebaseUser?.uid}
              photoURL={profile?.photoURL}
              size={40}
              title="Change profile picture"
              style={{ border: "2px solid white" }}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handlePicChange}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: "block" }}>{profile?.fullName}</strong>
            <button
              onClick={() => navigate("/edit-profile")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--ig-gray-text)",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Edit profile
            </button>
          </div>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        <form onSubmit={handleSearch}>
          <input
            className="input"
            placeholder="Search by username…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </form>
        {searching && (
          <div className="search-loading">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span style={{ fontSize: 13, color: "var(--ig-gray-text)" }}>Searching…</span>
          </div>
        )}
        {searchError && <p style={{ color: "var(--ig-red)", fontSize: 13 }}>{searchError}</p>}
        {searchResult && (
          <div className="chat-list-item" onClick={() => startChat(searchResult.uid)}>
            <Avatar seed={searchResult.uid} photoURL={searchResult.photoURL} size={44} />
            <div>
              <div style={{ fontWeight: 600 }}>{searchResult.fullName}</div>
              <div style={{ fontSize: 13, color: "var(--ig-gray-text)" }}>@{searchResult.username}</div>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === "chats" ? "active" : ""}`}
          onClick={() => setTab("chats")}
        >
          Chats
        </button>
        <button
          className={`sidebar-tab ${tab === "calls" ? "active" : ""}`}
          onClick={() => setTab("calls")}
        >
          Calls
        </button>
      </div>

      {tab === "calls" ? (
        <CallHistory />
      ) : chatsLoading ? (
        <ChatListSkeleton />
      ) : (
        <div className="chat-list-scroll">
          {chats
            .filter((chat) => !chat.hiddenFor?.[firebaseUser.uid])
            .map((chat) => {
        const otherUid = chat.participants.find((p) => p !== firebaseUser.uid);
        const other = otherUsers[otherUid];
        const unreadCount = chat.unread?.[firebaseUser.uid] || 0;
        return (
          <div
            key={chat.id}
            className={`chat-list-item ${chat.id === activeChatId ? "active" : ""} ${
              chat.id === pressedChatId ? "selected-for-delete" : ""
            }`}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              if (pressedChatId) {
                setPressedChatId(null);
                return;
              }
              navigate(`/chat/${chat.id}`);
            }}
            onPointerDown={() => startPress(chat.id)}
            onPointerUp={() => cancelPress(chat.id)}
            onPointerLeave={() => cancelPress(chat.id)}
            onPointerCancel={() => cancelPress(chat.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setPressedChatId(chat.id);
            }}
          >
            <div
              style={{ position: "relative", flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                if (pressedChatId) return;
                navigate(`/profile/${otherUid}`);
              }}
            >
              <Avatar
                seed={otherUid}
                photoURL={other?.photoURL}
                size={unreadCount > 0 ? 44 : 48}
                ring={unreadCount > 0}
                style={unreadCount > 0 ? { border: "2px solid white" } : {}}
              />
              <PresenceDot uid={otherUid} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontWeight: unreadCount > 0 ? 700 : 600, display: "inline-block" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (pressedChatId) return;
                  navigate(`/profile/${otherUid}`);
                }}
              >
                {other?.fullName || "…"}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: unreadCount > 0 ? 600 : 400,
                  color: unreadCount > 0 ? "var(--ig-black)" : "var(--ig-gray-text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {chat.lastMessage || "Say hi 👋"}
              </div>
            </div>
            {chat.id === pressedChatId ? (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="btn-danger" onClick={(e) => deleteChat(e, chat.id)}>
                  Delete
                </button>
                <button
                  className="btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPressedChatId(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              unreadCount > 0 && <span className="unread-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
            )}
          </div>
        );
          })}
        </div>
      )}
    </div>
  );
}
