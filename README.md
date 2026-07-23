# Pingly — Setup Guide (100% free tier, no billing account needed)

## Project layout

```
pingly/
  firebase.json
  firestore.rules
  firestore.indexes.json
  database.rules.json
  frontend/
    index.html
    package.json
    vite.config.js
    vercel.json
    public/
      favicon.svg
    api/                      # Vercel serverless functions (replaces Cloud Functions)
      _lib/
        firebaseAdmin.js
        verifyAuth.js
      sendPin.js
      verifyPin.js
      claimUsername.js
    src/
      main.jsx
      App.jsx
      theme.css
      lib/
        firebase.js
        firebaseConfig.js       # <- paste your Firebase web app config here
        cloudinaryConfig.js     # <- paste your Cloudinary cloud name + preset here
        cloudinary.js
        useAuth.js
      components/
        IncomingCallBanner.jsx
      pages/
        Register.jsx
        Login.jsx
        VerifyPin.jsx
        SetupProfile.jsx
        ChatList.jsx
        ChatWindow.jsx
        CallScreen.jsx
```

Username-based messaging + calls app. React (Vite) frontend, Firebase (Auth,
Firestore, Realtime Database) on the free Spark plan, Vercel serverless
functions (instead of Cloud Functions) for the PIN-email and username logic,
Cloudinary (instead of Firebase Storage) for profile pictures, Resend for PIN
emails, WebRTC for calls. Nothing here requires a credit card.

## Why this setup instead of the "default" Firebase one

Firebase Storage and Cloud Functions both require the paid **Blaze** plan
(a billing account has to be attached, even though small apps stay at $0).
Auth, Firestore, and Realtime Database are free on the **Spark** plan with
no billing account required. So this version swaps out just the two paid
pieces for free equivalents and keeps everything else as-is.

## 1. Create the Firebase project (Spark/free plan — do NOT upgrade to Blaze)

1. Go to https://console.firebase.google.com → Add project → name it "pingly".
2. Enable these products in the console:
   - **Authentication** → Sign-in method → Email/Password → Enable
   - **Firestore Database** → Create database → Start in **production mode**
   - **Realtime Database** → Create database (for call signaling — low latency)
   - Do **not** enable Storage — we're not using it.
3. Add a Web App (`</>` icon) to the project → copy the config object into
   `frontend/src/lib/firebaseConfig.js` (see placeholder in that file),
   including `databaseURL` (find it on the Realtime Database tab if it's
   not shown in the web app config).
4. Install the Firebase CLI locally: `npm install -g firebase-tools`
5. `firebase login`
6. From `/pingly`, run `firebase use --add` and pick this project (rules
   deploy only — there's no `functions` section anymore).

## 2. Get a Firebase service account key (for the API functions)

The `/api` functions need admin access to Firestore, the same way Cloud
Functions did.

1. Firebase console → Project settings (gear icon) → **Service accounts**.
2. Click **Generate new private key** → downloads a JSON file. Keep it secret.
3. Base64-encode it (you'll paste this into Vercel as one env var):
   ```bash
   # macOS/Linux
   base64 -i path/to/serviceAccountKey.json | tr -d '\n' > sa_base64.txt
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\serviceAccountKey.json")) > sa_base64.txt
   ```
4. Keep `sa_base64.txt` handy for step 5 — don't commit it anywhere.

## 3. Set up Resend (free tier)

1. Sign up at https://resend.com and grab an API key (Settings → API Keys).
2. The default sender in `api/sendPin.js` is Resend's shared test address
   `onboarding@resend.dev`, which only delivers to your own account email.
   To send to real users, verify your own domain in Resend (Domains → Add
   Domain → add the DNS records), then update `FROM_ADDRESS` in
   `frontend/api/sendPin.js`.

## 4. Set up Cloudinary (free tier, for profile pictures)

1. Sign up at https://cloudinary.com (no card required for the free tier).
2. Your **Cloud name** is shown at the top of the dashboard.
3. Settings → Upload → Upload presets → Add upload preset → set
   **Signing Mode** to **Unsigned** → Save. Copy the preset name.
4. Paste both into `frontend/src/lib/cloudinaryConfig.js`.

## 5. Deploy Firestore + Realtime Database rules (free, Spark plan)

From the repo root:
```bash
firebase deploy --only firestore:rules,firestore:indexes,database
```

## 6. Deploy the frontend + API functions to Vercel (free tier)

1. Install the CLI: `npm install -g vercel`
2. From `frontend/`: `vercel` (first run links/creates the project — set the
   root directory to `frontend` if deploying from the repo root instead).
3. In the Vercel dashboard → your project → Settings → Environment
   Variables, add:
   - `FIREBASE_SERVICE_ACCOUNT_B64` — paste the contents of `sa_base64.txt`
   - `RESEND_API_KEY` — your Resend key
4. Redeploy so the env vars take effect: `vercel --prod`

## 7. Run locally

The `/api` functions are Vercel serverless functions, so plain `vite dev`
won't run them. Use the Vercel CLI instead, which serves both the frontend
and the API together:
```bash
cd frontend
npm install
vercel dev
```
(First run will ask you to link the project and can pull the env vars you
set in step 6 automatically with `vercel env pull`.)

---

## Firestore data model

```
users/{uid}
  email: string
  emailVerified: boolean
  username: string            // denormalized for quick reads
  fullName: string
  photoURL: string            // now a Cloudinary URL, not Firebase Storage
  createdAt: timestamp
  lastSeen: timestamp

usernames/{username}          // reservation/lookup collection, doc ID = username (lowercase)
  uid: string                 // points back to owning user
  createdAt: timestamp

pins/{uid}                    // PIN verification, never exposed to client reads
  hashedPin: string
  expiresAt: timestamp
  attempts: number

chats/{chatId}                // chatId = sorted([uidA, uidB]).join('_')
  participants: [uidA, uidB]
  lastMessage: string
  lastMessageAt: timestamp
  lastMessageSender: uid

chats/{chatId}/messages/{messageId}
  senderId: uid
  text: string
  sentAt: timestamp
  status: "sent" | "delivered" | "read"

calls/{callId}                // Realtime Database, not Firestore — see below
```

## Realtime Database (call signaling)

```
calls/{callId}/
  offer: { sdp, type }
  answer: { sdp, type }
  callerCandidates/{pushId}: ICECandidate
  calleeCandidates/{pushId}: ICECandidate
  status: "ringing" | "accepted" | "ended" | "declined"
  callerId, calleeId, type: "audio" | "video"
```

## Registration + PIN verification flow

1. User enters email + password on the frontend → `createUserWithEmailAndPassword`.
2. Frontend calls `/api/sendPin` (with a Firebase ID token in the
   Authorization header) → generates a 4-digit PIN, hashes it, stores it in
   `pins/{uid}` with a 10-minute expiry, sends the PIN via Resend.
3. User enters the PIN on the Verify screen → frontend calls
   `/api/verifyPin` → compares hash, sets `users/{uid}.emailVerified = true`
   **server-side** (never trust a client-set boolean for this).
4. Only after verification can the user set profile pic / name / username
   and start chatting. Firestore rules double-check `emailVerified == true`
   on both sender and recipient before allowing a message write.

## Why some things are server-side only

- PIN generation/checking and setting `emailVerified` happen in the `/api`
  functions using the Firebase Admin SDK, not directly from the client, so
  a user can't just set their own `emailVerified: true` via the Firestore SDK.
- Username reservation uses a Firestore **transaction** against the
  `usernames` collection to prevent two people grabbing the same handle in
  a race.
- The Admin SDK (used in `/api`) bypasses Firestore security rules by
  design — the same trust model Cloud Functions had.

## Calls (audio/video) — how it works

Calls use WebRTC for the actual audio/video and the Realtime Database purely
for signaling (exchanging the offer/answer and ICE candidates) plus a simple
"ring" notification:

1. Tapping the call/video icon in `ChatWindow` navigates the caller to
   `/call/:callId?to=<otherUid>&type=audio|video&role=caller`.
2. `CallScreen` (caller side) creates an `RTCPeerConnection`, grabs local
   media, creates an SDP offer, and writes it to
   `calls/{callId}` in the Realtime Database. It also writes a pointer to
   `incomingCalls/{calleeUid}/{callId}` so the callee's app knows to ring.
3. `IncomingCallBanner` is mounted globally (inside the authenticated area)
   and listens to `incomingCalls/{myUid}`. When an entry appears, it shows an
   Accept/Decline bar with the caller's name.
4. Accepting navigates the callee to
   `/call/:callId?to=<callerUid>&type=...&role=callee`, where `CallScreen`
   reads the offer, creates an answer, and writes it back to `calls/{callId}`.
5. Both sides exchange ICE candidates through
   `calls/{callId}/callerCandidates` and `calls/{callId}/calleeCandidates`
   until the peer connection connects directly (or via TURN).
6. Either side hanging up sets `calls/{callId}.status = "ended"`, which the
   other side is listening for and uses to end the call locally.

**Before this works reliably outside of same-network testing**, add a TURN
server to the `ICE_SERVERS` config at the top of `CallScreen.jsx` — the free
STUN-only setup will fail behind many real-world NATs/firewalls. Twilio
Network Traversal Service or the Open Relay Project (metered.ca) both offer
usable free/low-cost TURN tiers to start with.
