import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/useAuth";
import { watchPresence } from "../lib/presence";
import Avatar from "../components/Avatar";

export default function ProfilePage() {
  const { uid } = useParams();
  const { firebaseUser, profile } = useAuth();
  const navigate = useNavigate();
  const [otherProfile, setOtherProfile] = useState(null);
  const [presence, setPresence] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) setOtherProfile(snap.data());
    })();
  }, [uid]);

  useEffect(() => {
    return watchPresence(uid, setPresence);
  }, [uid]);

  const iBlockedThem = Boolean(profile?.blockedUsers?.[uid]);
  const isMe = firebaseUser?.uid === uid;

  async function toggleBlock() {
    setBusy(true);
    try {
      await setDoc(
        doc(db, "users", firebaseUser.uid),
        { blockedUsers: { [uid]: iBlockedThem ? deleteField() : true } },
        { merge: true }
      );
    } catch (err) {
      alert(`Couldn't update block status: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-panel">
      <div className="chat-header" style={{ cursor: "default", background: "transparent", border: "none" }}>
        <button className="back-button" style={{ display: "inline-block" }} onClick={() => navigate(-1)}>
          ←
        </button>
        <div style={{ fontWeight: 600 }}>Profile</div>
      </div>

      <div className="profile-hero">
        <Avatar
          seed={uid}
          photoURL={otherProfile?.photoURL}
          size={96}
          style={{ margin: "0 auto 16px", border: "3px solid white" }}
        />
        <div style={{ fontSize: 20, fontWeight: 700 }}>{otherProfile?.fullName || "…"}</div>
        <div style={{ opacity: 0.9 }}>@{otherProfile?.username}</div>
        <div style={{ fontSize: 13, marginTop: 6, opacity: 0.85 }}>
          {presence?.state === "online" ? "Online now" : "Offline"}
        </div>
        {isMe && (
          <button className="profile-edit-link" onClick={() => navigate("/edit-profile")}>
            Edit profile
          </button>
        )}
      </div>

      <div className="profile-body">
        {otherProfile?.bio && <p className="profile-bio">{otherProfile.bio}</p>}
        <div className="profile-row">
          <span style={{ color: "var(--ig-gray-text)" }}>Username</span>
          <strong>@{otherProfile?.username}</strong>
        </div>
        <div className="profile-row">
          <span style={{ color: "var(--ig-gray-text)" }}>Email verified</span>
          <strong>{otherProfile?.emailVerified ? "Yes" : "No"}</strong>
        </div>

        {!isMe && (
          <>
            <button className={iBlockedThem ? "btn-outline" : "btn-danger"} disabled={busy} onClick={toggleBlock}>
              {busy ? "Please wait…" : iBlockedThem ? "Unblock" : "Block this person"}
            </button>

            {iBlockedThem && (
              <p style={{ fontSize: 13, color: "var(--ig-gray-text)" }}>
                You won't receive messages from this person while they're blocked. Unblock any time to resume chatting.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
