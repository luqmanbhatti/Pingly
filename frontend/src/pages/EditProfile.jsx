import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/useAuth";
import { uploadProfilePicture } from "../lib/cloudinary";
import Avatar from "../components/Avatar";

export default function EditProfile() {
  const { firebaseUser, profile } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.fullName || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || "");
  const [uploadingPic, setUploadingPic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handlePicChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPic(true);
    setError("");
    try {
      const url = await uploadProfilePicture(file);
      setPhotoURL(url);
    } catch (err) {
      setError(`Couldn't upload photo: ${err.message}`);
    } finally {
      setUploadingPic(false);
      e.target.value = "";
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Name can't be empty.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await setDoc(
        doc(db, "users", firebaseUser.uid),
        { fullName: fullName.trim(), bio: bio.trim().slice(0, 160), photoURL },
        { merge: true }
      );
      navigate(-1);
    } catch (err) {
      setError(`Couldn't save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-panel">
      <div className="chat-header" style={{ cursor: "default", background: "transparent", border: "none" }}>
        <button className="back-button" style={{ display: "inline-block" }} onClick={() => navigate(-1)}>
          ←
        </button>
        <div style={{ fontWeight: 600 }}>Edit profile</div>
      </div>

      <form className="profile-body" onSubmit={handleSave} style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <label style={{ cursor: uploadingPic ? "default" : "pointer" }}>
            <Avatar
              seed={firebaseUser?.uid}
              photoURL={photoURL}
              size={88}
              ring
              style={{ border: "3px solid white", opacity: uploadingPic ? 0.5 : 1 }}
            />
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePicChange} />
          </label>
          <span style={{ fontSize: 13, color: "var(--ig-gray-text)" }}>
            {uploadingPic ? "Uploading…" : "Tap photo to change it"}
          </span>
        </div>

        <div>
          <label style={{ fontSize: 13, color: "var(--ig-gray-text)", display: "block", marginBottom: 4 }}>
            Name
          </label>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={60}
            placeholder="Your name"
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: "var(--ig-gray-text)", display: "block", marginBottom: 4 }}>
            Bio
          </label>
          <textarea
            className="input"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            placeholder="Tell people a little about yourself…"
          />
          <div style={{ fontSize: 12, color: "var(--ig-gray-text)", textAlign: "right" }}>
            {bio.length}/160
          </div>
        </div>

        {error && <p style={{ color: "var(--ig-red)", fontSize: 13 }}>{error}</p>}

        <button className="btn-gradient" type="submit" disabled={saving || uploadingPic}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
