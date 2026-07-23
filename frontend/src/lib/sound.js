let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq, startTime, duration, gainPeak = 0.18) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

// Short two-note "ding" for a new incoming message.
export function playMessageDing() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    tone(880, now, 0.12);
    tone(1320, now + 0.09, 0.16);
  } catch {
    // Autoplay can be blocked until the user has interacted with the page; ignore.
  }
}

// Repeating phone-style ring pattern, started when an incoming call banner
// appears and stopped when it's accepted/declined/dismissed.
let ringInterval = null;
export function startRingtone() {
  stopRingtone();
  try {
    const ringOnce = () => {
      const ctx = getCtx();
      const now = ctx.currentTime;
      tone(700, now, 0.35, 0.15);
      tone(560, now + 0.4, 0.35, 0.15);
    };
    ringOnce();
    ringInterval = setInterval(ringOnce, 1600);
  } catch {
    // Ignore — worst case the visual banner still shows.
  }
}

export function stopRingtone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
}
