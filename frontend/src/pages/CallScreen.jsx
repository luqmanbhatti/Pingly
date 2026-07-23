import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { ref, set, update, remove, onValue, push, off } from "firebase/database";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { rtdb, db } from "../lib/firebase";
import { useAuth } from "../lib/useAuth";
import { watchPresence } from "../lib/presence";
import Avatar from "../components/Avatar";

// Public STUN server only — fine for two peers on friendly networks.
// For reliable calls across real-world NATs/firewalls you'll want a TURN
// server too (see README's "TURN server" note). Add it here, e.g.:
// { urls: "turn:your-turn-host:3478", username: "...", credential: "..." }
const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CallScreen() {
  const { callId } = useParams();
  const [searchParams] = useSearchParams();
  const otherUid = searchParams.get("to");
  const callType = searchParams.get("type") || "audio";
  const role = searchParams.get("role") || "caller"; // "caller" | "callee"

  const { firebaseUser } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState("connecting"); // connecting | ringing | live | ended
  const [otherPresence, setOtherPresence] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [speakerSupported, setSpeakerSupported] = useState(true);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const endedRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const loggedRef = useRef(false);
  const connectedAtRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return watchPresence(otherUid, setOtherPresence);
  }, [otherUid]);

  // Live call duration, ticking once per second while connected — cleared on end.
  useEffect(() => {
    if (status === "live") {
      timerRef.current = setInterval(() => {
        if (connectedAtRef.current) {
          setElapsed(Math.floor((Date.now() - connectedAtRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
    clearInterval(timerRef.current);
  }, [status]);

  // Only the caller writes the persistent Firestore call-history record (the
  // callee can still read it, since they're in `participants` too).
  async function logCallEnd(finalStatus) {
    if (role !== "caller" || loggedRef.current) return;
    loggedRef.current = true;
    const durationSec = connectedAtRef.current
      ? Math.round((Date.now() - connectedAtRef.current) / 1000)
      : 0;
    await updateDoc(doc(db, "callLogs", callId), {
      status: finalStatus,
      endedAt: serverTimestamp(),
      durationSec,
    }).catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    const callRef = ref(rtdb, `calls/${callId}`);
    const callerCandidatesRef = ref(rtdb, `calls/${callId}/callerCandidates`);
    const calleeCandidatesRef = ref(rtdb, `calls/${callId}/calleeCandidates`);
    const statusRef = ref(rtdb, `calls/${callId}/status`);

    function cleanup() {
      off(callRef);
      off(callerCandidatesRef);
      off(calleeCandidatesRef);
      off(statusRef);
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    }

    async function start() {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video",
        });
      } catch (err) {
        console.error("Could not access camera/mic:", err);
        setStatus("ended");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Remote audio/video: for video calls the <video> tag carries both
      // audio+video tracks. For audio-only calls there's no <video> element,
      // so the remote MediaStream must be attached to a dedicated <audio>
      // element instead, or no sound plays at all despite the connection
      // succeeding.
      const remoteStream = new MediaStream();
      const remoteMediaEl = callType === "video" ? remoteVideoRef.current : remoteAudioRef.current;
      if (remoteMediaEl) remoteMediaEl.srcObject = remoteStream;
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
        });
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const targetRef = role === "caller" ? callerCandidatesRef : calleeCandidatesRef;
        push(targetRef, event.candidate.toJSON());
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setStatus("live");
          wasConnectedRef.current = true;
          if (!connectedAtRef.current) connectedAtRef.current = Date.now();
        }
        if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
          endCallEverywhere();
        }
      };

      if (role === "caller") {
        setStatus("ringing");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await set(callRef, {
          callerId: firebaseUser.uid,
          calleeId: otherUid,
          type: callType,
          status: "ringing",
          offer: { sdp: offer.sdp, type: offer.type },
        });

        await setDoc(doc(db, "callLogs", callId), {
          participants: [firebaseUser.uid, otherUid],
          callerId: firebaseUser.uid,
          calleeId: otherUid,
          type: callType,
          status: "calling",
          createdAt: serverTimestamp(),
        }).catch(() => {});

        // Lightweight pointer so the callee's app can pop an incoming-call banner.
        await set(ref(rtdb, `incomingCalls/${otherUid}/${callId}`), {
          callerId: firebaseUser.uid,
          type: callType,
          createdAt: Date.now(),
        });

        onValue(ref(rtdb, `calls/${callId}/answer`), async (snap) => {
          const answer = snap.val();
          if (answer && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        onValue(calleeCandidatesRef, (snap) => {
          snap.forEach((child) => {
            pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => {});
          });
        });
      } else {
        // Callee: wait for the offer already stored on the call doc, answer it.
        onValue(callRef, async (snap) => {
          const data = snap.val();
          if (!data?.offer || pc.currentRemoteDescription) return;
          setStatus("ringing");
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await update(callRef, {
            status: "accepted",
            answer: { sdp: answer.sdp, type: answer.type },
          });
          remove(ref(rtdb, `incomingCalls/${firebaseUser.uid}/${callId}`));
        });

        onValue(callerCandidatesRef, (snap) => {
          snap.forEach((child) => {
            pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => {});
          });
        });
      }

      onValue(statusRef, (snap) => {
        const val = snap.val();
        if ((val === "ended" || val === "declined") && !endedRef.current) {
          endedRef.current = true;
          setStatus("ended");
          logCallEnd(val === "declined" ? "declined" : wasConnectedRef.current ? "completed" : "missed");
        }
      });
    }

    async function endCallEverywhere() {
      if (endedRef.current) return;
      endedRef.current = true;
      setStatus("ended");
      await update(callRef, { status: "ended" }).catch(() => {});
      logCallEnd(wasConnectedRef.current ? "completed" : "missed");
    }

    start().catch((err) => {
      console.error(err);
      setStatus("ended");
    });

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  async function hangUp() {
    endedRef.current = true;
    await update(ref(rtdb, `calls/${callId}`), { status: "ended" }).catch(() => {});
    await remove(ref(rtdb, `incomingCalls/${otherUid}/${callId}`)).catch(() => {});
    logCallEnd(wasConnectedRef.current ? "completed" : "cancelled");
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    navigate(-1);
  }

  // Best-effort loudspeaker toggle. setSinkId is only supported on some
  // desktop browsers (Chrome/Edge) — on most mobile browsers the OS/hardware
  // controls the audio route, so this is a graceful no-op there rather than
  // a broken button.
  async function toggleSpeaker() {
    const el = remoteVideoRef.current || remoteAudioRef.current;
    if (!el?.setSinkId) {
      setSpeakerSupported(false);
      setSpeakerOn((v) => !v);
      return;
    }
    try {
      await el.setSinkId(speakerOn ? "default" : "default");
      setSpeakerOn((v) => !v);
    } catch {
      setSpeakerSupported(false);
    }
  }

  const statusLabel =
    status === "live"
      ? formatDuration(elapsed)
      : status === "ringing"
      ? role === "caller"
        ? otherPresence?.state === "online"
          ? "Ringing…"
          : "Calling…"
        : "Ringing…"
      : status === "ended"
      ? "Call ended"
      : "Connecting…";

  return (
    <div className="call-screen">
      <div className="call-top">
        <div className="call-status">{statusLabel}</div>
        <div className="call-encrypted">🔒 End-to-end encrypted</div>
      </div>

      {callType === "video" ? (
        <div className="call-video-grid">
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
        </div>
      ) : (
        <div className="call-audio-avatar">
          <Avatar seed={otherUid} size={120} ring />
          <audio ref={remoteAudioRef} autoPlay />
        </div>
      )}

      <div className="call-controls">
        <button
          className={`call-icon-btn ${speakerOn ? "on" : ""}`}
          onClick={toggleSpeaker}
          title={speakerSupported ? "Toggle speaker" : "Speaker route is controlled by your device"}
        >
          🔊
        </button>
        <button className="btn-primary hangup" onClick={hangUp}>
          {status === "ended" ? "Close" : "Hang up"}
        </button>
      </div>
    </div>
  );
}
