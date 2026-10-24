import { Server, Socket } from 'socket.io';
import { RoomManager } from './classes/RoomManager';
import { canPerform } from './permissions';

interface SocketData {
  userId?: string;
  roomCode?: string;
}

export function registerSocketHandlers(
  io: Server,
  socket: Socket<any, any, any, SocketData>,
  roomManager: RoomManager
) {
  // ─── 1. CREATE ROOM ────────────────────────────────────────────────────────
  socket.on('create_room', (data: any, callback?: any) => {
    try {
      const { userId, username, roomCode } = data || {};
      if (!userId || !username) {
        const err = { message: 'userId and username are required to create a room' };
        socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      const room = roomManager.createRoom(userId, username, socket.id, roomCode);
      socket.data.userId = userId;
      socket.data.roomCode = room.roomCode;

      socket.join(room.roomCode);

      const syncState = room.getSyncState();
      socket.emit('room_created', {
        roomCode: room.roomCode,
        syncState,
      });

      // Broadcast initial sync state to the room
      room.broadcastSyncState(io);

      if (typeof callback === 'function') {
        callback({ success: true, roomCode: room.roomCode, syncState });
      }
    } catch (err: any) {
      console.error('[create_room error]', err);
      socket.emit('error', { message: err?.message || 'Failed to create room' });
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  });

  // ─── 2. JOIN ROOM ──────────────────────────────────────────────────────────
  socket.on('join_room', (data: any, callback?: any) => {
    try {
      const { roomCode, userId, username } = data || {};
      if (!roomCode || !userId || !username) {
        const err = { message: 'roomCode, userId, and username are required' };
        socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        const err = { message: 'Room not found' };
        socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      // Add or update participant with stable userId (prevents duplicates on refresh/reconnect)
      const { participant, isReconnect } = room.addOrUpdateParticipant(
        userId,
        username,
        socket.id,
        'participant'
      );

      socket.data.userId = userId;
      socket.data.roomCode = room.roomCode;
      socket.join(room.roomCode);

      const syncState = room.getSyncState();

      socket.emit('room_joined', {
        roomCode: room.roomCode,
        participant: participant.toData(),
        syncState,
        isReconnect,
      });

      // Broadcast updated sync state to all room members
      room.broadcastSyncState(io);

      // Notify others in room
      room.broadcast(
        io,
        isReconnect ? 'participant_reconnected' : 'participant_joined',
        { participant: participant.toData() },
        socket.id
      );

      if (typeof callback === 'function') {
        callback({ success: true, roomCode: room.roomCode, syncState });
      }
    } catch (err: any) {
      console.error('[join_room error]', err);
      socket.emit('error', { message: err?.message || 'Failed to join room' });
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  });

  // ─── 3. LEAVE ROOM ─────────────────────────────────────────────────────────
  socket.on('leave_room', (data: any, callback?: any) => {
    try {
      const roomCode = data?.roomCode || socket.data.roomCode;
      const userId = data?.userId || socket.data.userId;

      if (!roomCode || !userId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Missing roomCode or userId' });
        return;
      }

      const room = roomManager.getRoom(roomCode);
      if (room) {
        const leftParticipant = room.removeParticipant(userId);
        socket.leave(room.roomCode);
        socket.data.roomCode = undefined;

        if (leftParticipant) {
          room.broadcast(io, 'participant_left', { userId, username: leftParticipant.username });
          room.broadcastSyncState(io);
        }

        // Clean up empty room if no online members remain
        if (room.getActiveParticipantCount() === 0) {
          roomManager.deleteRoom(roomCode);
        }
      }

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[leave_room error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  });

  // ─── 4. PLAY (With permission check) ────────────────────────────────────────
  socket.on('play', (data: any, callback?: any) => {
    try {
      const roomCode = data?.roomCode || socket.data.roomCode;
      const userId = data?.userId || socket.data.userId;
      const time = typeof data?.time === 'number' ? data.time : 0;

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant) {
        socket.emit('error', { message: 'Participant not in room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Participant not in room' });
        return;
      }

      // Permission check
      if (!canPerform(participant.role, 'play')) {
        const err = {
          action: 'play',
          message: 'Permission denied: Only host or moderators can play video',
        };
        socket.emit('permission_denied', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      // Authorized: update playback & broadcast
      room.updatePlayback('play', time);
      room.broadcastSyncState(io);

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[play error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  });

  // ─── 5. PAUSE (With permission check) ───────────────────────────────────────
  socket.on('pause', (data: any, callback?: any) => {
    try {
      const roomCode = data?.roomCode || socket.data.roomCode;
      const userId = data?.userId || socket.data.userId;
      const time = typeof data?.time === 'number' ? data.time : 0;

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant) {
        socket.emit('error', { message: 'Participant not in room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Participant not in room' });
        return;
      }

      // Permission check
      if (!canPerform(participant.role, 'pause')) {
        const err = {
          action: 'pause',
          message: 'Permission denied: Only host or moderators can pause video',
        };
        socket.emit('permission_denied', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      // Authorized: update playback & broadcast
      room.updatePlayback('pause', time);
      room.broadcastSyncState(io);

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[pause error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  });

  // ─── 6. SEEK (With permission check) ────────────────────────────────────────
  socket.on('seek', (data: any, callback?: any) => {
    try {
      const roomCode = data?.roomCode || socket.data.roomCode;
      const userId = data?.userId || socket.data.userId;
      const time = typeof data?.time === 'number' ? data.time : 0;

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant) {
        socket.emit('error', { message: 'Participant not in room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Participant not in room' });
        return;
      }

      // Permission check
      if (!canPerform(participant.role, 'seek')) {
        const err = {
          action: 'seek',
          message: 'Permission denied: Only host or moderators can seek video',
        };
        socket.emit('permission_denied', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      // Authorized: update playback & broadcast
      room.updatePlayback('seek', time);
      room.broadcastSyncState(io);

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[seek error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  });

  // ─── 7. CHANGE VIDEO (With permission check) ────────────────────────────────
  socket.on('change_video', (data: any, callback?: any) => {
    try {
      const roomCode = data?.roomCode || socket.data.roomCode;
      const userId = data?.userId || socket.data.userId;
      const videoId = data?.videoId;

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant) {
        socket.emit('error', { message: 'Participant not in room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Participant not in room' });
        return;
      }

      if (!videoId) {
        socket.emit('error', { message: 'videoId is required' });
        if (typeof callback === 'function') callback({ success: false, error: 'videoId is required' });
        return;
      }

      // Permission check: Host / Moderator only. Participant is REJECTED.
      if (!canPerform(participant.role, 'change_video')) {
        const err = {
          action: 'change_video',
          message: 'Permission denied: Only host or moderators can change the video',
        };
        socket.emit('permission_denied', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      // Authorized: update video & broadcast
      room.changeVideo(videoId);
      room.broadcastSyncState(io);

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[change_video error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  });

  // ─── 8. DISCONNECT ──────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    try {
      const roomCode = socket.data.roomCode;
      const userId = socket.data.userId;

      if (!roomCode || !userId) return;

      const room = roomManager.getRoom(roomCode);
      if (room) {
        const participant = room.getParticipant(userId);
        // If the socket disconnecting is indeed the participant's latest socket
        if (participant && participant.socketId === socket.id) {
          room.removeParticipant(userId);
          room.broadcast(io, 'participant_disconnected', { userId, username: participant.username });
          room.broadcastSyncState(io);

          // If all members are offline, clean up room
          if (room.getActiveParticipantCount() === 0) {
            // Optional grace period or direct delete
            setTimeout(() => {
              const currentRoom = roomManager.getRoom(roomCode);
              if (currentRoom && currentRoom.getActiveParticipantCount() === 0) {
                roomManager.deleteRoom(roomCode);
              }
            }, 30000);
          }
        }
      }
    } catch (err: any) {
      console.error('[disconnect error]', err);
    }
  });
}
