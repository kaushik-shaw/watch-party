# YouTube Watch Party 🎬

A production-grade, real-time synchronized YouTube Watch Party web application built with **Next.js**, **React**, **Node.js (Express)**, **Socket.IO**, **Prisma ORM**, and the **YouTube IFrame Player API**.

---

## 🌐 Live Deployment URL

- **Production URL**: [https://watch-party-1-yers.onrender.com](https://watch-party-1-yers.onrender.com/) 
- **WebSocket Backend**: [https://watch-party-hptw.onrender.com](https://watch-party-hptw.onrender.com)

---

## 📋 Features Checklist (PDF Assignment Matching)

| Requirement | PDF Specification | Status in Codebase | Implementation Details |
|---|---|---|---|
| **Real-time Synchronization** | Play/pause, seek position, current video synchronized | ✅ Implemented | Broadcasts `sync_state`, `play`, `pause`, `seek`, `change_video` with wall-clock drift compensation (`<1.2s` threshold). |
| **Room-based Model** | Users create or join rooms with unique links/codes | ✅ Implemented | 6-char alphanumeric room codes (`POST /api/rooms`), shareable links (`/room/[code]`), existence validation (`GET /api/rooms/:code`). |
| **YouTube Integration** | Controllable embedded YouTube player | ✅ Implemented | Full integration via official `YouTube IFrame Player API`, supporting standard URLs, `youtu.be`, `/shorts/`, `/live/`, and video IDs. |
| **WebSockets** | Real-time bidirectional communication | ✅ Implemented | Full duplex WebSocket communication powered by **Socket.IO** with OOP server architecture. |
| **Role-Based Access Control (RBAC)** | Host, Moderator, Participant, Viewer roles | ✅ Implemented | Strict server-side permission validation (`canPerform`) restricting playback to Host & Moderator. |
| **Role Promotion & Assignment** | Host assigns roles (Participant → Moderator) | ✅ Implemented | `assign_role` event updates role in-memory and in PostgreSQL, broadcasts `role_assigned`. |
| **Participant Removal** | Host removes users from the room | ✅ Implemented | `remove_participant` kicks socket, bans userId from rejoining, broadcasts `participant_removed`. |
| **Host Transfer** | Host transfers ownership to another participant | ✅ Implemented | `transfer_host` demotes former host to moderator, promotes new host, persists to DB. |
| **Participant Request Workflow** | Participant requests host/mod to approve actions | ✅ Implemented | `action_request` puts request in pending queue; `resolve_request` executes action on approval. |
| **Live Chat & Reactions (Bonus)** | Text chat + floating emoji reactions | ✅ Implemented | Real-time chat with recent history persistence (50 msgs) and floating emoji reactions on key moments. |
| **OOP Architecture (Bonus)** | Object-oriented WebSocket server | ✅ Implemented | Encapsulated into `Room`, `Participant`, `RoomManager`, and `MessageHandler` classes. |
| **Database Persistence (Bonus)** | Room state and sessions saved in DB | ✅ Implemented | **Prisma ORM** with **PostgreSQL** backing rooms, sessions, participants, and chat logs asynchronously. |
| **Session Security (Bonus)** | Reconnection grace period & hijack defense | ✅ Implemented | Cryptographic `sessionToken` preventing session impersonation; 15s host disconnect grace period. |

---

## 🏗️ Architecture Overview

The application is structured into a decoupled, high-performance architecture:
- **Frontend**: Next.js App Router (`app/page.tsx` for landing & room creation, `app/room/[id]/page.tsx` for the synchronized watch party room).
- **Backend**: Express + Socket.IO server (`server/index.ts`) written with Object-Oriented Programming (OOP) design patterns.
- **Database**: PostgreSQL with Prisma ORM (`prisma/schema.prisma` & `server/db.ts`) providing asynchronous persistence without blocking the real-time event loop.

```
┌────────────────────────────────────────────────────────┐
│                      Clients                           │
│  [Host]             [Moderator]         [Participants] │
└───────┬──────────────────┬─────────────────────┬───────┘
        │                  │                     │
        │ WebSockets       │ WebSockets          │ WebSockets
        │ (Socket.IO)      │ (Socket.IO)         │ (Socket.IO)
        ▼                  ▼                     ▼
┌────────────────────────────────────────────────────────┐
│             Node.js / Express WebSocket Server         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ MessageHandler (Rate limiting, Validation, Auth) │  │
│  └───────────────────────┬──────────────────────────┘  │
│                          ▼                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │ RoomManager (In-memory Rooms Map & Lifecycle)    │  │
│  │  └── Room Class                                  │  │
│  │       ├── PlaybackState (videoId, isPlaying, time)│  │
│  │       ├── Participants Map (Host, Mod, Users)    │  │
│  │       └── Action Requests Queue (Pending actions)│  │
│  └───────────────────────┬──────────────────────────┘  │
└──────────────────────────┼─────────────────────────────┘
                           │ Async Non-blocking Sync
                           ▼
┌────────────────────────────────────────────────────────┐
│              PostgreSQL Database (Prisma)              │
│   [Rooms]   [Participants]   [UserSessions]  [Messages]│
└────────────────────────────────────────────────────────┘
```

### Real-Time Synchronization Mechanism
1. **Wall-Clock Time Extrapolation**: When video is playing, the server records `{ currentTime, updatedAt: Date.now() }`.
2. **Clock-Skew Immune Client Interpolation**: Clients compute the current target time using local elapsed time:
   $$\text{ExpectedTime} = \text{currentTime} + (\text{Date.now()} - \text{lastSyncPacketTime}) \times \text{playbackRate}$$
3. **Drift Compensation**: If a client drifts more than **1.2 seconds** from the expected wall-clock time, programmatic `seekTo` aligns the video.
4. **Heartbeat Drift Alignment**: The host emits periodic `sync_time` heartbeats, ensuring smooth sync across all network conditions without jitter.

---

## 📡 WebSocket Event Specifications

All events strictly adhere to the PDF specification:

### Client → Server Events
| Event | Payload | Permissions | Description |
|---|---|---|---|
| `join_room` | `{ roomId, username }` | Public | Joins room. If room doesn't exist, user becomes **Host**; subsequent joiners become **Participant**. |
| `leave_room` | `{ roomId }` | Member | User gracefully leaves the room. |
| `play` | `{}` | Host, Moderator | Resumes video playback; server broadcasts state to room. |
| `pause` | `{}` | Host, Moderator | Pauses video playback; server broadcasts state to room. |
| `seek` | `{ time: number }` | Host, Moderator | Seeks video to specified timestamp in seconds. |
| `change_video`| `{ videoId: string }` | Host, Moderator | Changes the active YouTube video (supports URLs, shorts, or 11-char IDs). |
| `assign_role` | `{ userId: string, role: Role }` | Host only | Host promotes or demotes a participant (`moderator`, `participant`, `viewer`). |
| `remove_participant` | `{ userId: string }` | Host only | Host kicks a user and bans them from the room session. |
| `transfer_host` | `{ userId: string }` | Host only | Transfers host ownership to another active participant. |
| `action_request` | `{ action, targetValue, description }`| Participant | Submits a playback action request for Host/Moderator approval. |
| `resolve_request`| `{ requestId, approved }` | Host, Moderator | Approves or rejects a pending participant action request. |
| `send_chat` | `{ message: string }` | Member | Sends rate-limited message to room chat. |
| `reaction` | `{ emoji: string }` | Member | Broadcasts floating emoji reaction to all participants. |

### Server → Client Events
| Event | Payload | Description |
|---|---|---|
| `sync_state` | `{ playState, currentTime, videoId, participants, hostId }` | Full room and playback snapshot broadcast to all participants. |
| `user_joined` | `{ username, userId, role, participants }` | Broadcast when a new participant connects. |
| `user_left` | `{ username, userId, participants }` | Broadcast when a participant leaves or disconnects. |
| `role_assigned` | `{ userId, username, role, participants }` | Broadcast when a role is changed or host is transferred. |
| `participant_removed` | `{ userId, participants }` | Broadcast when a user is kicked by the host. |
| `play` / `pause` | `{}` | Direct playback event notification. |
| `seek` | `{ time: number }` | Direct seek timestamp notification. |
| `change_video` | `{ videoId: string }` | Direct video change notification. |
| `request_added` | `ActionRequestItem` | Sent to Host and Moderators when a participant submits a request. |
| `request_resolved`| `{ requestId, approved, action, resolvedBy }` | Sent to participant and controllers on approval/rejection. |
| `permission_denied` | `{ message, action }` | Sent to a socket attempting an unauthorized action. |

---

## 👥 Role-Based Access Control (RBAC) Matrix

| Capability / Action | Host (Creator) | Moderator | Participant | Viewer |
|---|:---:|:---:|:---:|:---:|
| Play / Pause video | ✅ | ✅ | ❌ *(Request only)* | ❌ |
| Seek / Scrub timeline | ✅ | ✅ | ❌ *(Request only)* | ❌ |
| Change YouTube video | ✅ | ✅ | ❌ *(Request only)* | ❌ |
| Assign Roles (`assign_role`) | ✅ | ❌ | ❌ | ❌ |
| Remove Participant (`remove_participant`) | ✅ | ❌ | ❌ | ❌ |
| Transfer Host (`transfer_host`) | ✅ | ❌ | ❌ | ❌ |
| Approve / Reject Requests | ✅ | ✅ | ❌ | ❌ |
| Submit Action Requests | N/A | N/A | ✅ | ✅ |
| Send Chat & Floating Reactions | ✅ | ✅ | ✅ | ✅ |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.17.0 or later
- **npm** or **yarn** / **pnpm**
- *(Optional)* **PostgreSQL**: For persistent rooms and chat logs. If PostgreSQL is not configured, the app runs in **memory-only mode** automatically.

### 1. Clone the Repository
```bash
git clone https://github.com/kaushik-shaw/watch-party.git
cd watch-party
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure `.env` contains:
```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
PORT=4000
DATABASE_URL="postgresql://postgres:password@localhost:5432/watchparty?schema=public"
```
*(If running without PostgreSQL, DATABASE_URL can be omitted or left as-is; the server will log a warning and use high-speed in-memory state).*

### 4. Database Setup (Optional)
```bash
npx prisma generate
npx prisma db push
```

### 5. Run the Application

#### Terminal 1 — Start the WebSocket Backend:
```bash
npm run server
```
Server starts on `http://localhost:4000`.

#### Terminal 2 — Start the Next.js Frontend:
```bash
npm run dev
```
Client runs on `http://localhost:3000`.

Open [http://localhost:3000](http://localhost:3000) in multiple browser tabs or incognito windows to test synchronized watch parties!

---

## 💡 Code Walkthrough & Evaluation Topics

### 1. How Each Library / Tool is Used
- **Socket.IO**: Powers real-time bidirectional communication. We chose Socket.IO over raw WebSockets (`ws`) because it provides automatic reconnection, socket rooms (`io.to(roomCode)`), fallback transports, and structured event acknowledgments.
- **Next.js & React 19**: App router provides modern SSR for landing page SEO and responsive client-side routing (`/room/[id]`) for single-page real-time media interaction.
- **YouTube IFrame API**: Official YouTube API dynamically controlled via ref. Embedded controls are overlaid for participants to enforce role-based access.
- **Express**: Lightweight HTTP server hosting room REST endpoints (`/api/rooms`, `/health`) and attaching the WebSocket server.
- **Prisma & PostgreSQL**: Typesafe ORM asynchronously recording room metadata, participant attendance, and chat logs.

### 2. How WebSockets Enable Real-Time Sync
- Single source of truth on the server: playback state `{ videoId, isPlaying, currentTime, updatedAt }`.
- When Host or Moderator pauses, seeks, or changes video, the server validates permissions, updates in-memory room state, and broadcasts `sync_state`.
- Latency and clock drift are mitigated using local wall-clock extrapolation so participants remain in sub-second sync even on differing network latencies.

### 3. How Role-Based Logic Works on the Backend
- Handlers in `MessageHandler.ts` extract the authenticated `userId` and `roomCode` bound to `socket.data`.
- Before executing any playback, role change, or kick event, `canPerform(participant.role, action)` verifies permissions against `ROLE_PERMISSIONS`.
- If unauthorized, a `permission_denied` event is returned immediately without mutating room state.

### 4. Trade-Offs & Challenges Overcome
- **Client Clock Skew**: Standard network latency causes server timestamps to disagree with client clocks. Resolved by measuring elapsed client time relative to packet arrival.
- **Host Refresh vs Host Departure**: If a host refreshes the page, treating disconnection as an immediate leave would prematurely transfer host role. Solved by implementing a **15-second host grace period**.
- **Session Hijacking**: Users entering someone else's username cannot steal their host privileges thanks to server-generated secret `sessionTokens`.
- **IFrame Click Interception**: Standard YouTube iframes capture clicks inside the iframe. Solved by setting `pointerEvents: none` for participants, redirecting clicks to an interactive request modal.

---

## ☁️ Deployment Guide

### Deploying on Render / Railway
1. **Frontend + Backend (Unified Container)** or **Separate Services**:
   - Backend Start Command: `npm run server:deploy`
   - Frontend Build Command: `npm run build`
   - Frontend Start Command: `npm run start`
2. Set Environment Variables:
   - `NEXT_PUBLIC_SOCKET_URL`: URL of your deployed WebSocket server (e.g., `https://watch-party-backend.onrender.com`).
   - `PORT`: `4000` (or platform default `$PORT`).
   - `DATABASE_URL`: Hosted PostgreSQL connection string (from Supabase, Neon, Render, or Railway).

---

## 📄 License
MIT License. Created for the YouTube Watch Party Intern Assignment.
