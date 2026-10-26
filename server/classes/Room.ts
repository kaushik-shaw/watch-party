import { Server } from 'socket.io';
import { Participant } from './Participant';
import { PlaybackState, Role, RoomSyncState } from '../types';

export interface ActionRequestItem {
  id: string;
  userId: string;
  username: string;
  action: 'pause' | 'play' | 'seek' | 'change_video';
  description: string;
  targetValue?: any;
  timestamp: number;
}

export class Room {
  public roomCode: string;
  public hostId: string;
  public participants: Map<string, Participant>; // Keyed by stable userId
  public playback: PlaybackState;
  public createdAt: number;

  public deletionTimeout: NodeJS.Timeout | null = null;
  public hostGraceTimeout: NodeJS.Timeout | null = null;
  public disconnectPurgeTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // Banned users (kicked by host)
  public bannedUserIds: Set<string> = new Set();

  // Session verification tokens (prevents session hijacking by userId)
  public sessionTokens: Map<string, string> = new Map();

  // Pending participant action requests
  public pendingRequests: Map<string, ActionRequestItem> = new Map();

  constructor(roomCode: string, hostUserId: string, hostUsername: string, hostSocketId: string) {
    this.roomCode = roomCode;
    this.hostId = hostUserId;
    this.participants = new Map();
    this.createdAt = Date.now();

    // The creator is registered as the initial host
    const host = new Participant(hostUserId, hostUsername, hostSocketId, 'host');
    this.participants.set(hostUserId, host);

    // Initial default playback state
    this.playback = {
      videoId: '',
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
    };
  }

  cancelDeletionTimeout() {
    if (this.deletionTimeout) {
      clearTimeout(this.deletionTimeout);
      this.deletionTimeout = null;
    }
  }

  cancelHostGraceTimeout() {
    if (this.hostGraceTimeout) {
      clearTimeout(this.hostGraceTimeout);
      this.hostGraceTimeout = null;
    }
  }

  cancelDisconnectPurge(userId: string) {
    const timer = this.disconnectPurgeTimeouts.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectPurgeTimeouts.delete(userId);
    }
  }

  isBanned(userId: string): boolean {
    return this.bannedUserIds.has(userId);
  }

  banUser(userId: string): void {
    this.bannedUserIds.add(userId);
  }

  createOrGetSessionToken(userId: string): string {
    let token = this.sessionTokens.get(userId);
    if (!token) {
      token = 'tok_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      this.sessionTokens.set(userId, token);
    }
    return token;
  }

  validateSessionToken(userId: string, token?: string): boolean {
    const existing = this.sessionTokens.get(userId);
    // If no token exists yet, allow establishing
    if (!existing) return true;
    return existing === token;
  }

  /**
   * Adds or updates a participant upon join/reconnect.
   */
  addOrUpdateParticipant(
    userId: string,
    username: string,
    socketId: string,
    providedToken?: string
  ): { participant: Participant; isReconnect: boolean; token: string } {
    this.cancelDeletionTimeout();
    this.cancelDisconnectPurge(userId);

    const cleanUsername = username ? username.trim() : 'Guest';
    const token = this.createOrGetSessionToken(userId);

    // 1. Reconnection by stable userId
    const existing = this.participants.get(userId);

    if (existing) {
      existing.updateSocketId(socketId);
      existing.isOnline = true;
      if (cleanUsername) {
        existing.username = cleanUsername;
      }

      // If the host reconnected, cancel any pending host grace election
      if (existing.userId === this.hostId) {
        this.cancelHostGraceTimeout();
        existing.role = 'host';
      }

      return { participant: existing, isReconnect: true, token };
    }

    // 2. New participant joining
    // Check if host has been offline and room needs a host election
    const currentHost = this.participants.get(this.hostId);
    let role: Role = 'participant';

    if (this.participants.size === 0 || !currentHost || !currentHost.isOnline) {
      // Elect as host if no host or host is gone
      role = 'host';
      if (currentHost && currentHost.userId !== userId) {
        currentHost.role = 'participant';
      }
      this.hostId = userId;
      this.cancelHostGraceTimeout();
    }

    const newParticipant = new Participant(userId, cleanUsername, socketId, role);
    this.participants.set(userId, newParticipant);
    return { participant: newParticipant, isReconnect: false, token };
  }

  /**
   * Network disconnect (browser tab closed, back button, or network loss).
   * Immediately treats user as left and elects next host if host disconnected.
   */
  handleDisconnect(userId: string, io: Server): Participant | undefined {
    const participant = this.participants.get(userId);
    if (!participant) return undefined;

    participant.isOnline = false;
    this.cancelDisconnectPurge(userId);

    // If host disconnects, elect next active host immediately
    if (userId === this.hostId) {
      this.cancelHostGraceTimeout();
      this.electNextHost(io, userId);
    }

    // Immediately remove offline participant so other tabs see them leave right away
    this.participants.delete(userId);
    this.sessionTokens.delete(userId);

    return participant;
  }

  /**
   * Explicit leave: immediately purges participant from room.
   */
  handleExplicitLeave(userId: string, io: Server): Participant | undefined {
    const participant = this.participants.get(userId);
    this.cancelDisconnectPurge(userId);

    if (participant) {
      // If host leaves explicitly, elect immediately
      if (userId === this.hostId) {
        this.cancelHostGraceTimeout();
        this.electNextHost(io, userId);
      }
      this.participants.delete(userId);
      this.sessionTokens.delete(userId);
    }

    return participant;
  }

  /**
   * Elects the next active moderator (or participant) as host.
   * Demotes the old host cleanly so only one user holds the host role.
   */
  electNextHost(io: Server, previousHostId?: string): Participant | null {
    const oldHostId = previousHostId || this.hostId;
    const oldHost = this.participants.get(oldHostId);

    // Look for active online moderator first, then any online participant
    const candidate =
      Array.from(this.participants.values()).find(
        (p) => p.isOnline && p.userId !== oldHostId && p.role === 'moderator'
      ) ||
      Array.from(this.participants.values()).find(
        (p) => p.isOnline && p.userId !== oldHostId
      );

    if (candidate) {
      if (oldHost) {
        oldHost.role = 'participant';
      }
      candidate.role = 'host';
      this.hostId = candidate.userId;
      this.cancelHostGraceTimeout();

      this.broadcast(io, 'role_assigned', {
        userId: candidate.userId,
        username: candidate.username,
        role: 'host',
        participants: this.getParticipantsData(),
      });
      this.broadcastSyncState(io);
      return candidate;
    }

    return null;
  }

  getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  deleteParticipant(userId: string): Participant | undefined {
    const participant = this.participants.get(userId);
    this.cancelDisconnectPurge(userId);
    if (participant) {
      this.participants.delete(userId);
      this.sessionTokens.delete(userId);
    }
    return participant;
  }

  getParticipantBySocketId(socketId: string): Participant | undefined {
    return Array.from(this.participants.values()).find((p) => p.socketId === socketId);
  }

  getActiveParticipantCount(): number {
    return Array.from(this.participants.values()).filter((p) => p.isOnline).length;
  }

  getCurrentPlaybackTime(): number {
    if (!this.playback.isPlaying) {
      return this.playback.currentTime;
    }
    const rate = this.playback.playbackRate || 1.0;
    const elapsed = Math.max(0, (Date.now() - this.playback.updatedAt) / 1000) * rate;
    return Math.round((this.playback.currentTime + elapsed) * 100) / 100;
  }

  updatePlayback(action: 'play' | 'pause' | 'seek', time?: number, maxDuration?: number) {
    let validTime = typeof time === 'number' && Number.isFinite(time) && time >= 0
      ? time
      : this.getCurrentPlaybackTime();

    if (typeof maxDuration === 'number' && maxDuration > 0) {
      validTime = Math.min(validTime, maxDuration);
    }

    this.playback.currentTime = Math.max(0, validTime);
    this.playback.updatedAt = Date.now();

    if (action === 'play') {
      this.playback.isPlaying = true;
    } else if (action === 'pause') {
      this.playback.isPlaying = false;
    }
  }

  updateParticipantRole(userId: string, newRole: Role) {
    const p = this.participants.get(userId);
    if (!p) return;

    if (newRole === 'host') {
      const oldHost = this.participants.get(this.hostId);
      if (oldHost && oldHost.userId !== userId) {
        oldHost.role = 'moderator';
      }
      this.hostId = userId;
      this.cancelHostGraceTimeout();
    }
    p.role = newRole;
  }

  changeVideo(videoId: string) {
    this.playback.videoId = videoId;
    this.playback.currentTime = 0;
    this.playback.isPlaying = false;
    this.playback.updatedAt = Date.now();
  }

  /**
   * Returns list of participants.
   * If onlineOnly is true, filters out offline ghost entries.
   */
  getParticipantsData(onlineOnly = false) {
    return Array.from(this.participants.values())
      .filter((p) => (!onlineOnly ? true : p.isOnline))
      .map((p) => p.toData());
  }

  getSyncState(): RoomSyncState {
    const curTime = this.getCurrentPlaybackTime();
    const now = Date.now();
    return {
      roomCode: this.roomCode,
      roomId: this.roomCode,
      hostId: this.hostId,
      playback: {
        ...this.playback,
        currentTime: curTime,
        updatedAt: now,
      },
      playState: this.playback.isPlaying ? 'playing' : 'paused',
      isPlaying: this.playback.isPlaying,
      currentTime: curTime,
      videoId: this.playback.videoId,
      participants: this.getParticipantsData(true), // Filter out stale offline ghosts
    };
  }

  broadcast(io: Server, event: string, payload: any, excludeSocketId?: string) {
    if (excludeSocketId) {
      io.to(this.roomCode).except(excludeSocketId).emit(event, payload);
    } else {
      io.to(this.roomCode).emit(event, payload);
    }
  }

  broadcastSyncState(io: Server) {
    io.to(this.roomCode).emit('sync_state', this.getSyncState());
  }

  // Pending Requests Management
  addPendingRequest(req: ActionRequestItem) {
    this.pendingRequests.set(req.id, req);
  }

  getPendingRequest(id: string): ActionRequestItem | undefined {
    return this.pendingRequests.get(id);
  }

  removePendingRequest(id: string): boolean {
    return this.pendingRequests.delete(id);
  }

  getPendingRequestsArray(): ActionRequestItem[] {
    return Array.from(this.pendingRequests.values());
  }
}
