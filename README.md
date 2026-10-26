# YouTube Watch Party 🎬

A real-time YouTube Watch Party platform that allows multiple users to watch videos together with synchronized playback.

## Features

- **Real-time Synchronization:** Synchronizes video playback, pause/resume actions, seeking, and video changes.
- **Room-Based Sessions:** Create and join watch parties using unique room links or codes.
- **YouTube Integration:** Watch YouTube videos together in a shared virtual room.
- **WebSocket Communication:** Enables real-time communication between the server and connected clients.
- **Role-Based Access Control:** Supports Host, Moderator, and Participant roles.
- **Participant Management:** Allows hosts to manage participants and assign roles.

## Tech Stack

- Next.js
- TypeScript
- React
- WebSockets
- YouTube IFrame Player API

## Getting Started

Clone the repository:

```bash
git clone https://github.com/kaushik-shaw/watch-party.git
cd watch-party
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Architecture & Lifecycle Notes

- **In-Memory Room State**: Active room sessions, WebSockets, pending requests, and synchronization timers live in server memory for ultra-low latency real-time communication.
  - *Server Restarts*: Active in-memory room states and pending request queues are ephemeral and will reset if the server restarts.
  - *Database Persistence*: Rooms, user sessions, participants, and chat logs are backed asynchronously by Prisma ORM and PostgreSQL.
- **Session Hijack Prevention**: Rejoining an existing participant session requires a secret, server-issued session token (`sessionToken`) issued upon room join/creation. Sockets without a valid token cannot take over existing participants or hosts.
- **Host Disconnect Grace Period**: When a host disconnects or refreshes, the server holds a 15-second grace period before re-electing a new host. Upon re-election, the former host is cleanly demoted to participant so multiple hosts can never exist simultaneously.
- **Room API Security**: `GET /api/rooms/:code` returns only public sanity metadata (`{ exists, roomCode, activeCount }`) without leaking internal `hostId` or participant lists.
- **YouTube Support**: Supports standard video URLs, `youtu.be` links, `/shorts/`, and `/live/` streams.

## License

MIT License
