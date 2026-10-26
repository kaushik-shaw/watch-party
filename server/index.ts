import fs from 'fs';
import path from 'path';

// Automatically load .env file if DATABASE_URL or PORT is not set
if (!process.env.DATABASE_URL || !process.env.PORT) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(path.resolve(process.cwd(), '.env'));
    } catch {}
  }
  if (!process.env.DATABASE_URL) {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              let val = trimmed.slice(eqIdx + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
        });
      }
    } catch {}
  }
}

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './classes/RoomManager';
import { registerSocketHandlers } from './handlers';
import { isDatabaseAvailable } from './db';

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Enable CORS for Express
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Setup Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// Central RoomManager singleton
export const roomManager = new RoomManager();

// Root status route
app.get('/', (_req, res) => {
  res.json({
    message: '🚀 WatchParty Socket.IO backend is up and running!',
    port: PORT,
    health: '/health',
    activeRooms: roomManager.getAllRooms().length,
  });
});

// REST API Endpoints
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    roomsActive: roomManager.getAllRooms().length,
    timestamp: Date.now(),
  });
});

// Generate new room code via POST
app.post('/api/rooms', (_req, res) => {
  const roomCode = roomManager.generateCode();
  return res.json({ success: true, roomCode });
});

// Check if room exists without leaking hostId or participant details
app.get('/api/rooms/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const room = roomManager.getRoom(code);
  if (!room) {
    return res.status(404).json({ exists: false, message: 'Room not found' });
  }
  return res.json({
    exists: true,
    roomCode: room.roomCode,
    activeCount: room.getActiveParticipantCount(),
  });
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`[Socket connected] ${socket.id}`);
  registerSocketHandlers(io, socket, roomManager);
});

server.listen(PORT, async () => {
  console.log(`🚀 WatchParty Socket.IO server running on http://localhost:${PORT}`);
  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    console.log(`✅ PostgreSQL database connected successfully via Prisma ORM`);
  } else {
    console.warn(`⚠️ PostgreSQL database not reachable, running in memory-only mode`);
  }
});
