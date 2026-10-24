import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './classes/RoomManager';
import { registerSocketHandlers } from './handlers';

const app = express();
const server = http.createServer(app);

// Enable CORS for Express
app.use(cors({ origin: '*' }));
app.use(express.json());

// Setup Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Central RoomManager singleton
export const roomManager = new RoomManager();

// Pre-populate demo rooms for immediate testing
roomManager.createRoom('user_alex_1', 'Alex (Host)', 'mock_socket_alex', 'WATCH1');
roomManager.createRoom('user_sam_1', 'Sam (Host)', 'mock_socket_sam', 'PARTY1');

// Root status route
app.get('/', (_req, res) => {
  res.json({
    message: '🚀 WatchParty Socket.IO backend is up and running!',
    port: 4000,
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

app.get('/api/rooms/:code', (req, res) => {
  const code = req.params.code;
  const room = roomManager.getRoom(code);
  if (!room) {
    return res.status(404).json({ exists: false, message: 'Room not found' });
  }
  return res.json({
    exists: true,
    roomCode: room.roomCode,
    hostId: room.hostId,
    activeCount: room.getActiveParticipantCount(),
    playback: room.playback,
  });
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`[Socket connected] ${socket.id}`);
  registerSocketHandlers(io, socket, roomManager);
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 WatchParty Socket.IO server running on http://localhost:${PORT}`);
});
