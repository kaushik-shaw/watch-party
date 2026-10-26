import crypto from 'crypto';
import { Server, Socket } from 'socket.io';
import { RoomManager } from './RoomManager';
import { Room } from './Room';
import { canPerform } from '../permissions';
import { Role } from '../types';
import {
  syncRoomToDb,
  recordUserSession,
  endUserSession,
  saveMessageToDb,
  updateParticipantRoleInDb,
  deleteParticipantFromDb,
  markRoomInactiveInDb,
  loadRoomFromDb,
} from '../db';

export interface SocketData {
  userId?: string;
  roomCode?: string;
  username?: string;
}

/**
 * Extracts an 11-character YouTube video ID from a raw ID or full YouTube URL.
 * Supports standard URLs, shorts, embeds, and live streams.
 */
export function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

export function sanitize(val: any, maxLen = 100): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

export function cleanRoomCode(code: any): string {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

/**
 * Encapsulates WebSocket message and event handling for a connected client socket.
 * Enforces strict session-based authentication using socket.data.
 */
export class MessageHandler {
  private io: Server;
  private socket: Socket<any, any, any, SocketData>;
  private roomManager: RoomManager;
  private chatTimestamps: number[] = [];

  constructor(io: Server, socket: Socket<any, any, any, SocketData>, roomManager: RoomManager) {
    this.io = io;
    this.socket = socket;
    this.roomManager = roomManager;
  }

  /**
   * Simple sliding-window rate limiter (max 5 messages per 5 seconds).
   */
  private isRateLimited(): boolean {
    const now = Date.now();
    this.chatTimestamps = this.chatTimestamps.filter((t) => now - t < 5000);
    if (this.chatTimestamps.length >= 5) {
      return true;
    }
    this.chatTimestamps.push(now);
    return false;
  }

  /**
   * Registers all standard WebSocket event handlers.
   */
  public register(): void {
    // 1. Room lifecycle
    this.socket.on('create_room', (data: any, cb?: any) => this.handleCreateRoom(data, cb));
    this.socket.on('join_room', (data: any, cb?: any) => this.handleJoinRoom(data, cb));
    this.socket.on('leave_room', (data: any, cb?: any) => this.handleLeaveRoom(data, cb));

    // 2. Playback synchronization
    this.socket.on('play', (data: any, cb?: any) => this.handlePlay(data, cb));
    this.socket.on('pause', (data: any, cb?: any) => this.handlePause(data, cb));
    this.socket.on('seek', (data: any, cb?: any) => this.handleSeek(data, cb));
    this.socket.on('sync_time', (data: any) => this.handleSyncTime(data));
    this.socket.on('change_video', (data: any, cb?: any) => this.handleChangeVideo(data, cb));

    // 3. Role & Member Management
    this.socket.on('assign_role', (data: any, cb?: any) => this.handleAssignRole(data, cb));
    this.socket.on('transfer_host', (data: any, cb?: any) => this.handleTransferHost(data, cb));
    this.socket.on('remove_participant', (data: any, cb?: any) => this.handleRemoveParticipant(data, cb));

    // 4. Action requests & Approval workflow
    this.socket.on('action_request', (data: any, cb?: any) => this.handleActionRequest(data, cb));
    this.socket.on('resolve_request', (data: any, cb?: any) => this.handleResolveRequest(data, cb));

    // 5. Engagement (Reactions & Text Chat)
    this.socket.on('send_chat', (data: any, cb?: any) => this.handleSendChat(data, cb));
    this.socket.on('reaction', (data: any) => this.handleReaction(data));

    // 6. Socket disconnect
    this.socket.on('disconnect', () => this.handleDisconnect());
  }

  private handleCreateRoom(data: any, callback?: (res: any) => void): void {
    this.handleJoinRoom({ ...data, create: true }, callback);
  }

  private async handleJoinRoom(data: any, callback?: (res: any) => void): Promise<void> {
    try {
      const roomCode = cleanRoomCode(data?.roomId || data?.roomCode);
      const userId = sanitize(data?.userId || `user_${crypto.randomUUID()}`, 50);
      const username = sanitize(data?.username || 'Guest', 30);
      const isCreateRequest = Boolean(data?.create);
      const sessionToken = sanitize(data?.sessionToken, 100);

      if (!roomCode) {
        const err = { message: 'Room code is required' };
        this.socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      let room = this.roomManager.getRoom(roomCode);

      // Attempt restoring from DB if memory cache missed (e.g. after Render sleep/restart)
      if (!room) {
        const dbRoom = await loadRoomFromDb(roomCode);
        if (dbRoom && dbRoom.status !== 'ended') {
          room = this.roomManager.restoreRoomFromDb({
            roomCode: dbRoom.roomCode,
            hostId: dbRoom.hostId,
            videoId: dbRoom.videoId,
            currentTime: dbRoom.currentTime,
            isPlaying: dbRoom.isPlaying,
            playbackRate: dbRoom.playbackRate,
            messages: dbRoom.messages,
          });
        }
      }

      // If room still doesn't exist, only allow creation if create: true was passed
      if (!room) {
        if (!isCreateRequest) {
          const err = { error: 'ROOM_NOT_FOUND', message: 'Room not found. Check your room code or create a new room.' };
          this.socket.emit('error', err);
          if (typeof callback === 'function') callback({ success: false, ...err });
          return;
        }
        room = this.roomManager.createRoom(userId, username, this.socket.id, roomCode);
      }

      // Check if user is banned
      if (room.isBanned(userId)) {
        const err = { error: 'BANNED', message: 'You have been removed from this room by the host' };
        this.socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, ...err });
        return;
      }

      // Session hijack prevention
      if (!room.validateSessionToken(userId, sessionToken)) {
        const err = { error: 'SESSION_EXISTS', message: 'This user session is already active in the room' };
        this.socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, ...err });
        return;
      }

      const { participant, isReconnect, token } = room.addOrUpdateParticipant(userId, username, this.socket.id, sessionToken);

      // Bind authenticated session state to socket
      this.socket.data.userId = userId;
      this.socket.data.roomCode = room.roomCode;
      this.socket.data.username = participant.username;

      this.socket.join(room.roomCode);

      const syncState = room.getSyncState();
      const isController = participant.role === 'host' || participant.role === 'moderator';
      const pendingReqs = isController ? room.getPendingRequestsArray() : [];
      const chatHistory = room.getChatHistory();

      this.socket.emit('room_joined', {
        roomCode: room.roomCode,
        roomId: room.roomCode,
        syncState,
        role: participant.role,
        sessionToken: token,
        requests: pendingReqs,
        chatHistory,
      });

      // Send requests_list to host or moderator
      if (isController && pendingReqs.length > 0) {
        this.socket.emit('requests_list', pendingReqs);
      }

      // Broadcast user_joined (toast + list). A reconnect inside the grace window
      // (page refresh) is not a new join, so the room is only sent the fresh sync_state.
      if (!isReconnect) {
        room.broadcast(this.io, 'user_joined', {
          username: participant.username,
          userId: participant.userId,
          role: participant.role,
          participants: room.getParticipantsData(true),
        });
      }

      room.broadcastSyncState(this.io);

      // Persist room and user session in DB
      const currentActiveCount = room.getActiveParticipantCount();
      syncRoomToDb({
        roomCode: room.roomCode,
        hostId: room.hostId,
        videoId: room.playback.videoId,
        currentTime: room.playback.currentTime,
        isPlaying: room.playback.isPlaying,
        activeCount: currentActiveCount,
      });
      recordUserSession({
        userId,
        username: participant.username,
        roomCode: room.roomCode,
        socketId: this.socket.id,
        role: participant.role,
        activeCount: currentActiveCount,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode: room.roomCode,
          roomId: room.roomCode,
          syncState,
          role: participant.role,
          sessionToken: token,
          requests: pendingReqs,
          chatHistory,
        });
      }
    } catch (err: any) {
      console.error('[join_room error]', err);
      this.socket.emit('error', { message: err?.message || 'Failed to join room' });
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleLeaveRoom(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;

      if (!roomCode || !userId) {
        if (typeof callback === 'function') callback({ success: false, error: 'User not currently in a room' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (room) {
        const participant = room.getParticipant(userId);
        // Verify socket owns this participant
        if (participant && participant.socketId === this.socket.id) {
          const hadRequests = room.clearUserPendingRequests(userId);
          if (hadRequests) {
            for (const [, p] of room.participants) {
              if ((p.role === 'host' || p.role === 'moderator') && p.socketId) {
                this.io.to(p.socketId).emit('requests_list', room.getPendingRequestsArray());
              }
            }
          }

          const leftParticipant = room.handleExplicitLeave(userId, this.io);
          this.socket.leave(room.roomCode);
          this.socket.data.roomCode = undefined;

          if (leftParticipant) {
            room.broadcast(this.io, 'user_left', {
              username: leftParticipant.username,
              userId,
              participants: room.getParticipantsData(true),
            });
            room.broadcastSyncState(this.io);
          }

          endUserSession(roomCode, userId, this.socket.id);

          // Mark room inactive immediately and schedule deletion if room has zero active users
          if (room.getActiveParticipantCount() === 0) {
            markRoomInactiveInDb(roomCode);
            room.cancelDeletionTimeout();
            room.deletionTimeout = setTimeout(() => {
              const currentRoom = this.roomManager.getRoom(roomCode);
              if (currentRoom && currentRoom.getActiveParticipantCount() === 0) {
                this.roomManager.deleteRoom(roomCode);
                markRoomInactiveInDb(roomCode);
              }
            }, 30000);
          }
        }
      }

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[leave_room error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handlePlay(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;

      if (!roomCode || !userId) {
        this.socket.emit('error', { message: 'Unauthorized: Not in a room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        this.socket.emit('error', { message: 'Room not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant || !participant.isOnline) {
        this.socket.emit('error', { message: 'Participant not active in room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Participant not active' });
        return;
      }

      if (!canPerform(participant.role, 'play')) {
        const err = { action: 'play', message: 'Permission denied: Only host or moderators can play video' };
        this.socket.emit('permission_denied', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      const time = typeof data?.time === 'number' && Number.isFinite(data.time) && data.time >= 0 ? data.time : undefined;
      room.updatePlayback('play', time);
      room.broadcastSyncState(this.io);

      syncRoomToDb({
        roomCode: room.roomCode,
        hostId: room.hostId,
        videoId: room.playback.videoId,
        currentTime: room.playback.currentTime,
        isPlaying: true,
      });

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[play error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handlePause(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;

      if (!roomCode || !userId) {
        this.socket.emit('error', { message: 'Unauthorized: Not in a room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        this.socket.emit('error', { message: 'Room not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant || !participant.isOnline) {
        this.socket.emit('error', { message: 'Participant not active in room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Participant not active' });
        return;
      }

      if (!canPerform(participant.role, 'pause')) {
        const err = { action: 'pause', message: 'Permission denied: Only host or moderators can pause video' };
        this.socket.emit('permission_denied', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      const time = typeof data?.time === 'number' && Number.isFinite(data.time) && data.time >= 0 ? data.time : undefined;
      room.updatePlayback('pause', time);
      room.broadcastSyncState(this.io);

      syncRoomToDb({
        roomCode: room.roomCode,
        hostId: room.hostId,
        videoId: room.playback.videoId,
        currentTime: room.playback.currentTime,
        isPlaying: false,
      });

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[pause error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleSeek(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;
      const rawTime = data?.time;

      if (!roomCode || !userId) {
        this.socket.emit('error', { message: 'Unauthorized: Not in a room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized' });
        return;
      }

      // Validate seek time strictly
      if (typeof rawTime !== 'number' || !Number.isFinite(rawTime) || rawTime < 0) {
        const err = { message: 'Invalid seek time provided' };
        this.socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        this.socket.emit('error', { message: 'Room not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant || !participant.isOnline) {
        this.socket.emit('error', { message: 'Participant not active in room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Participant not active' });
        return;
      }

      if (!canPerform(participant.role, 'seek')) {
        const err = { action: 'seek', message: 'Permission denied: Only host or moderators can seek video' };
        this.socket.emit('permission_denied', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      room.updatePlayback('seek', rawTime);
      room.broadcastSyncState(this.io);

      syncRoomToDb({
        roomCode: room.roomCode,
        hostId: room.hostId,
        videoId: room.playback.videoId,
        currentTime: rawTime,
        isPlaying: room.playback.isPlaying,
      });

      if (typeof callback === 'function') callback({ success: true, time: rawTime });
    } catch (err: any) {
      console.error('[seek error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleChangeVideo(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;
      const rawVideo = data?.videoId || data?.url;
      const extractedId = extractYouTubeId(rawVideo);

      if (!roomCode || !userId) {
        this.socket.emit('error', { message: 'Unauthorized: Not in a room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        this.socket.emit('error', { message: 'Room not found' });
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant || !participant.isOnline) {
        this.socket.emit('error', { message: 'Participant not active in room' });
        if (typeof callback === 'function') callback({ success: false, error: 'Participant not active' });
        return;
      }

      if (!canPerform(participant.role, 'change_video')) {
        const err = { action: 'change_video', message: 'Permission denied: Only host or moderators can change the video' };
        this.socket.emit('permission_denied', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      if (!extractedId) {
        const err = { message: 'Invalid YouTube video ID or URL format' };
        this.socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      room.changeVideo(extractedId);
      room.broadcastSyncState(this.io);

      syncRoomToDb({
        roomCode: room.roomCode,
        hostId: room.hostId,
        videoId: extractedId,
        currentTime: 0,
        isPlaying: false,
      });

      if (typeof callback === 'function') callback({ success: true, videoId: extractedId });
    } catch (err: any) {
      console.error('[change_video error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleAssignRole(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const hostUserId = this.socket.data.userId;
      const targetUserId = sanitize(data?.userId || data?.targetUserId, 50);
      const newRole = data?.role as Role;

      if (!roomCode || !hostUserId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized' });
        return;
      }

      if (!targetUserId || !newRole || !['host', 'moderator', 'participant', 'viewer'].includes(newRole)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid target user or role' });
        return;
      }

      // If new role is host, delegate to handleTransferHost so ownership and DB are fully updated
      if (newRole === 'host') {
        this.handleTransferHost({ userId: targetUserId }, callback);
        return;
      }

      // Host cannot change their own role here
      if (targetUserId === hostUserId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Cannot modify your own role' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const hostParticipant = room.getParticipant(hostUserId);
      if (!hostParticipant || !canPerform(hostParticipant.role, 'assign_role')) {
        this.socket.emit('permission_denied', { message: 'Only host can assign roles' });
        if (typeof callback === 'function') callback({ success: false, error: 'Permission denied' });
        return;
      }

      const targetParticipant = room.getParticipant(targetUserId);
      if (!targetParticipant) {
        if (typeof callback === 'function') callback({ success: false, error: 'Target participant not found in room' });
        return;
      }

      room.updateParticipantRole(targetUserId, newRole);

      // Persist role change to DB (map viewer to participant in DB schema)
      updateParticipantRoleInDb(roomCode, targetUserId, newRole === 'viewer' ? 'participant' : newRole);

      room.broadcast(this.io, 'role_assigned', {
        userId: targetUserId,
        username: targetParticipant.username,
        role: newRole,
        hostId: room.hostId,
        participants: room.getParticipantsData(true),
      });

      // Send pending requests to newly appointed moderator
      if (newRole === 'moderator' && targetParticipant.socketId) {
        this.io.to(targetParticipant.socketId).emit('requests_list', room.getPendingRequestsArray());
      }

      room.broadcastSyncState(this.io);
      if (typeof callback === 'function') callback({ success: true, role: newRole });
    } catch (err: any) {
      console.error('[assign_role error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleTransferHost(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const hostUserId = this.socket.data.userId;
      const targetUserId = sanitize(data?.userId || data?.targetUserId, 50);

      if (!roomCode || !hostUserId || !targetUserId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized: Not active in room' });
        return;
      }

      if (targetUserId === hostUserId) {
        if (typeof callback === 'function') callback({ success: false, error: 'You are already the host' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const hostParticipant = room.getParticipant(hostUserId);
      const isHost = room.hostId === hostUserId || (hostParticipant && canPerform(hostParticipant.role, 'transfer_host'));
      if (!isHost) {
        this.socket.emit('permission_denied', { message: 'Only host can transfer host ownership' });
        if (typeof callback === 'function') callback({ success: false, error: 'Permission denied' });
        return;
      }

      const targetParticipant = room.getParticipant(targetUserId);
      if (!targetParticipant || !targetParticipant.isOnline) {
        if (typeof callback === 'function') callback({ success: false, error: 'Cannot transfer host to an offline participant' });
        return;
      }

      // Demote old host to moderator, promote target to host
      if (hostParticipant) {
        hostParticipant.role = 'moderator';
      }
      targetParticipant.role = 'host';
      room.hostId = targetUserId;
      room.cancelHostGraceTimeout();

      // Persist host transfer in DB
      updateParticipantRoleInDb(roomCode, hostUserId, 'moderator');
      updateParticipantRoleInDb(roomCode, targetUserId, 'host');
      syncRoomToDb({ roomCode, hostId: targetUserId });

      // Send pending requests to new host
      if (targetParticipant.socketId) {
        this.io.to(targetParticipant.socketId).emit('requests_list', room.getPendingRequestsArray());
      }

      room.broadcast(this.io, 'role_assigned', {
        userId: targetUserId,
        username: targetParticipant.username,
        role: 'host',
        hostId: targetUserId,
        participants: room.getParticipantsData(true),
      });

      room.broadcastSyncState(this.io);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[transfer_host error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleRemoveParticipant(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const hostUserId = this.socket.data.userId;
      const targetUserId = sanitize(data?.userId || data?.targetUserId, 50);

      if (!roomCode || !hostUserId || !targetUserId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized: Not active in room' });
        return;
      }

      // Host cannot kick themselves
      if (targetUserId === hostUserId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Host cannot remove themselves from room' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const hostParticipant = room.getParticipant(hostUserId);
      const isHost = room.hostId === hostUserId || (hostParticipant && canPerform(hostParticipant.role, 'remove_participant'));
      if (!isHost) {
        this.socket.emit('permission_denied', { message: 'Only host can remove participants' });
        if (typeof callback === 'function') callback({ success: false, error: 'Permission denied' });
        return;
      }

      // Ban target user from rejoining immediately
      room.banUser(targetUserId);

      // Clear any pending requests from the removed user
      const hadRequests = room.clearUserPendingRequests(targetUserId);
      if (hadRequests) {
        for (const [, p] of room.participants) {
          if ((p.role === 'host' || p.role === 'moderator') && p.socketId) {
            this.io.to(p.socketId).emit('requests_list', room.getPendingRequestsArray());
          }
        }
      }

      const targetParticipant = room.getParticipant(targetUserId);
      room.deleteParticipant(targetUserId);

      // Persist participant deletion to DB
      deleteParticipantFromDb(roomCode, targetUserId);

      // Broadcast participant_removed as per specification
      room.broadcast(this.io, 'participant_removed', {
        userId: targetUserId,
        participants: room.getParticipantsData(true),
      });

      // Notify and evict the kicked participant's socket
      const targetSocket = Array.from(this.io.sockets.sockets.values()).find(
        (s) => s.id === targetParticipant?.socketId || (s.data as SocketData)?.userId === targetUserId
      );

      if (targetSocket) {
        targetSocket.emit('participant_removed', {
          userId: targetUserId,
          participants: room.getParticipantsData(true),
        });
        targetSocket.emit('kicked', { roomCode: room.roomCode, message: 'You have been removed from the room by the host' });
        targetSocket.leave(room.roomCode);
        (targetSocket.data as SocketData).roomCode = undefined;
      }

      room.broadcastSyncState(this.io);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[remove_participant error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleActionRequest(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;
      const action = data?.action; // 'pause' | 'play' | 'seek' | 'change_video'
      let targetValue = data?.targetValue;

      if (!roomCode || !userId || !action || !['pause', 'play', 'seek', 'change_video'].includes(action)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid action request' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant || !participant.isOnline) {
        if (typeof callback === 'function') callback({ success: false, error: 'User not active in room' });
        return;
      }

      if (action === 'change_video' && targetValue) {
        const validId = extractYouTubeId(targetValue);
        if (!validId) {
          if (typeof callback === 'function') callback({ success: false, error: 'Invalid YouTube URL or ID' });
          return;
        }
        targetValue = validId;
      }

      // Cap: Maximum 3 active pending requests per user to prevent spam
      const userPending = room.getPendingRequestsArray().filter((r) => r.userId === userId);
      if (userPending.length >= 3) {
        if (typeof callback === 'function') {
          callback({
            success: false,
            error: 'Maximum 3 pending requests allowed. Please wait for host to resolve your current requests.',
          });
        }
        return;
      }

      // Dedupe: Reject identical duplicate requests
      const isDuplicate = userPending.some(
        (r) => r.action === action && String(r.targetValue) === String(targetValue)
      );
      if (isDuplicate) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Identical request already pending in queue' });
        }
        return;
      }

      const requestItem = {
        id: 'req_' + crypto.randomUUID(),
        userId,
        username: participant.username, // strictly from verified server state
        action,
        description: sanitize(data?.description, 100) || (action === 'pause' ? 'wants to Pause video' : action === 'play' ? 'wants to Play video' : action === 'seek' ? 'wants to Seek video' : 'wants to Change video'),
        targetValue,
        timestamp: Date.now(),
      };

      // Store in room queue to prevent duplicate execution and survive refreshes
      room.addPendingRequest(requestItem);

      for (const [, p] of room.participants) {
        if ((p.role === 'host' || p.role === 'moderator') && p.socketId) {
          this.io.to(p.socketId).emit('request_added', requestItem);
        }
      }

      if (typeof callback === 'function') callback({ success: true, request: requestItem });
    } catch (err: any) {
      console.error('[action_request error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleResolveRequest(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const resolverUserId = this.socket.data.userId;
      const requestId = sanitize(data?.requestId, 50);
      const approved = Boolean(data?.approved);

      if (!roomCode || !resolverUserId || !requestId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Missing parameters' });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const resolver = room.getParticipant(resolverUserId);
      if (!resolver || !canPerform(resolver.role, 'resolve_request')) {
        this.socket.emit('permission_denied', { message: 'Only hosts or mods can resolve requests' });
        if (typeof callback === 'function') callback({ success: false, error: 'Permission denied' });
        return;
      }

      const storedReq = room.getPendingRequest(requestId);
      if (!storedReq) {
        if (typeof callback === 'function') callback({ success: false, error: 'Request not found or already resolved' });
        return;
      }

      // Remove from pending queue
      room.removePendingRequest(requestId);

      if (approved) {
        if (storedReq.action === 'pause') {
          room.updatePlayback('pause');
          room.broadcastSyncState(this.io);
        } else if (storedReq.action === 'play') {
          room.updatePlayback('play');
          room.broadcastSyncState(this.io);
        } else if (storedReq.action === 'seek' && typeof storedReq.targetValue === 'number' && storedReq.targetValue >= 0) {
          room.updatePlayback('seek', storedReq.targetValue);
          room.broadcastSyncState(this.io);
        } else if (storedReq.action === 'change_video' && storedReq.targetValue) {
          room.changeVideo(storedReq.targetValue);
          room.broadcastSyncState(this.io);
        }
      }

      // Notify the requester individually
      const requester = room.getParticipant(storedReq.userId);
      if (requester && requester.socketId) {
        this.io.to(requester.socketId).emit('request_resolved', {
          requestId,
          approved,
          action: storedReq.action,
          resolvedBy: resolver.username,
        });
      }

      // Notify hosts/mods so their pending list updates
      for (const [, p] of room.participants) {
        if ((p.role === 'host' || p.role === 'moderator') && p.socketId) {
          this.io.to(p.socketId).emit('request_resolved', {
            requestId,
            approved,
            action: storedReq.action,
            resolvedBy: resolver.username,
          });
        }
      }

      if (typeof callback === 'function') callback({ success: true });
    } catch (err: any) {
      console.error('[resolve_request error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleSendChat(data: any, callback?: (res: any) => void): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;
      const message = sanitize(data?.message, 500);

      if (!roomCode || !userId || !message) {
        if (typeof callback === 'function') callback({ success: false, error: 'Empty or unauthorized message' });
        return;
      }

      if (this.isRateLimited()) {
        const err = { message: 'Chat rate limit exceeded. Please wait a few seconds.' };
        this.socket.emit('error', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
        return;
      }

      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }

      const participant = room.getParticipant(userId);
      if (!participant || !participant.isOnline) {
        if (typeof callback === 'function') callback({ success: false, error: 'User not active in room' });
        return;
      }

      const chatItem = {
        id: 'msg_' + crypto.randomUUID(),
        userId,
        username: participant.username, // strictly from server state
        message,
        timestamp: Date.now(),
      };

      room.addChatMessage(chatItem);
      room.broadcast(this.io, 'chat_received', chatItem);
      saveMessageToDb({ roomCode, userId, username: participant.username, message });

      if (typeof callback === 'function') callback({ success: true, chat: chatItem });
    } catch (err: any) {
      console.error('[send_chat error]', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message });
    }
  }

  private handleReaction(data: any): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;
      const emoji = sanitize(data?.emoji, 10);

      // Whitelist five allowed reaction emojis
      const ALLOWED_EMOJIS = new Set(['👍', '😂', '😮', '❤️', '🔥']);
      if (!roomCode || !userId || !emoji || !ALLOWED_EMOJIS.has(emoji)) return;

      const room = this.roomManager.getRoom(roomCode);
      if (!room) return;

      const participant = room.getParticipant(userId);
      if (!participant || !participant.isOnline) return;

      room.broadcast(this.io, 'reaction_received', {
        id: crypto.randomUUID(),
        userId,
        username: participant.username,
        emoji,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.error('[reaction error]', err);
    }
  }

  private handleSyncTime(data: any): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;
      if (!roomCode || !userId) return;

      const room = this.roomManager.getRoom(roomCode);
      if (!room) return;

      const participant = room.getParticipant(userId);
      if (!participant || (participant.role !== 'host' && participant.role !== 'moderator')) return;

      const time = data?.time;
      if (typeof time === 'number' && Number.isFinite(time) && time >= 0) {
        room.playback.currentTime = time;
        room.playback.updatedAt = Date.now();
        this.socket.to(roomCode).emit('time_update', {
          time,
          isPlaying: room.playback.isPlaying,
        });
      }
    } catch (err: any) {
      console.error('[sync_time error]', err);
    }
  }

  private handleDisconnect(): void {
    try {
      const roomCode = this.socket.data.roomCode;
      const userId = this.socket.data.userId;

      if (!roomCode || !userId) return;

      const room = this.roomManager.getRoom(roomCode);
      if (room) {
        const participant = room.getParticipant(userId);
        if (participant && participant.socketId === this.socket.id) {
          // Marks participant offline but keeps their seat: a refresh reconnects within
          // seconds and keeps its role. The host gets 15s before re-election, everyone
          // is removed for good after 30s (see Room.handleDisconnect).
          room.handleDisconnect(userId, this.io, {
            onHostElected: (newHost, oldHost) => {
              updateParticipantRoleInDb(roomCode, newHost.userId, 'host');
              updateParticipantRoleInDb(roomCode, oldHost.userId, 'participant');
              syncRoomToDb({ roomCode, hostId: newHost.userId });
              if (newHost.socketId) {
                this.io.to(newHost.socketId).emit('requests_list', room.getPendingRequestsArray());
              }
            },
            onPurged: (gone) => {
              deleteParticipantFromDb(roomCode, gone.userId);
              const hadRequests = room.clearUserPendingRequests(gone.userId);
              if (hadRequests) {
                for (const [, p] of room.participants) {
                  if ((p.role === 'host' || p.role === 'moderator') && p.socketId) {
                    this.io.to(p.socketId).emit('requests_list', room.getPendingRequestsArray());
                  }
                }
              }
              room.broadcast(this.io, 'user_left', {
                username: gone.username,
                userId: gone.userId,
                participants: room.getParticipantsData(true),
              });
            },
          });

          // Drop them from everyone's list right away; the "left" toast only
          // fires if they do not come back (onPurged above).
          room.broadcastSyncState(this.io);

          endUserSession(roomCode, userId, this.socket.id);

          if (room.getActiveParticipantCount() === 0) {
            markRoomInactiveInDb(roomCode);
            room.cancelDeletionTimeout();
            room.deletionTimeout = setTimeout(() => {
              const currentRoom = this.roomManager.getRoom(roomCode);
              if (currentRoom && currentRoom.getActiveParticipantCount() === 0) {
                this.roomManager.deleteRoom(roomCode);
                markRoomInactiveInDb(roomCode);
              }
            }, 30000);
          }
        }
      }
    } catch (err: any) {
      console.error('[disconnect error]', err);
    }
  }
}
