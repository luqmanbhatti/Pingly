// A curated set of friendly, colorful emoji used as a stand-in avatar for
// anyone without a profile photo. Picked deterministically from their uid
// (or any other stable seed) so the same person always gets the same emoji.
const AVATAR_EMOJIS = [
  "🦊", "🐼", "🐸", "🐵", "🐨", "🦁", "🐯", "🐰",
  "🐻", "🐶", "🐱", "🦄", "🐙", "🦋", "🐢", "🦉",
  "🐳", "🦖", "🐝", "🍉", "🍕", "⚡", "🌈", "🔥",
  "🌟", "🍩", "🎯", "🎨", "🚀", "🌵", "🍄", "🦩",
];

export function emojiFor(seed) {
  const s = seed || "?";
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length];
}

// `seed` should be a stable id (usually the user's uid) so their emoji never
// changes between renders/sessions. Falls back to a real photo if provided.
export default function Avatar({ seed, photoURL, size = 44, ring = false, style, onClick, title }) {
  const emoji = emojiFor(seed);

  const inner = (
    <div
      className="avatar"
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        backgroundImage: photoURL ? `url(${photoURL})` : undefined,
        backgroundSize: "cover",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        cursor: onClick ? "pointer" : undefined,
        flexShrink: 0,
        ...style,
      }}
    >
      {!photoURL && emoji}
    </div>
  );

  return ring ? <div className="avatar-ring">{inner}</div> : inner;
}
