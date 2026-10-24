import { Server } from 'socket.io';
import { Participant } from './Participant';
import { PlaybackState, Role, RoomSyncState } from '../types';

export class Room {
  public roomCode: string;
  public hostId: string;
  public participants: Map<string, Participant>; // Keyed by stable userId
  public playback: PlaybackState;
  public createdAt: number;

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
      videoId: 'dQw4w9WgXcQ', // Default demo video
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
    };
  }

  /**
   * Adds a new participant or updates an existing participant (stable userId reconnect).
   * Prevents duplicates when a user refreshes or reconnects.
   */
  addOrUpdateParticipant(
    userId: string,
    username: string,
    socketId: string,
    requestedRole: Role = 'participant'
  ): { participant: Participant; isReconnect: boolean } {
    const existing = this.participants.get(userId);

    if (existing) {
      // Reconnection or refresh with same stable userId
      existing.updateSocketId(socketId);
      if (username && username.trim()) {
        existing.username = username.trim();
      }
      // Ensure host keeps host role upon reconnect
      if (existing.userId === this.hostId) {
        existing.role = 'host';
      }
      return { participant: existing, isReconnect: true };
    }

    // New participant
    const isHost = this.participants.size === 0 || userId === this.hostId;
    const role: Role = isHost ? 'host' : requestedRole;
    if (isHost) {
      this.hostId = userId;
    }

    const newParticipant = new Participant(userId, username, socketId, role);
    this.participants.set(userId, newParticipant);
    return { participant: newParticipant, isReconnect: false };
  }

  /**
   * Marks a participant offline or removes them.
   */
  removeParticipant(userId: string): Participant | undefined {
    const participant = this.participants.get(userId);
    if (participant) {
      participant.isOnline = false;

      // If the host left and went offline, elect next active participant as host
      if (userId === this.hostId) {
        const nextActive = Array.from(this.participants.values()).find(
          (p) => p.isOnline && p.userId !== userId
        );
        if (nextActive) {
          nextActive.role = 'host';
          this.hostId = nextActive.userId;
        }
      }
    }
    return participant;
  }

  /**
   * Completely purges a participant from the room.
   */
  deleteParticipant(userId: string): boolean {
    return this.participants.delete(userId);
  }

  getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  getParticipantBySocketId(socketId: string): Participant | undefined {
    return Array.from(this.participants.values()).find((p) => p.socketId === socketId);
  }

  getActiveParticipantCount(): number {
    return Array.from(this.participants.values()).filter((p) => p.isOnline).length;
  }

  /**
   * Updates playback state for play, pause, or seek.
   */
  updatePlayback(action: 'play' | 'pause' | 'seek', time: number) {
    this.playback.currentTime = Math.max(0, time);
    this.playback.updatedAt = Date.now();

    if (action === 'play') {
      this.playback.isPlaying = true;
    } else if (action === 'pause') {
      this.playback.isPlaying = false;
    }
  }

  /**
   * Changes the active YouTube video.
   */
  changeVideo(videoId: string) {
    this.playback.videoId = videoId;
    this.playback.currentTime = 0;
    this.playback.isPlaying = false;
    this.playback.updatedAt = Date.now();
  }

  /**
   * Returns current sync state snapshot for clients.
   */
  getSyncState(): RoomSyncState {
    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      playback: { ...this.playback },
      participants: Array.from(this.participants.values()).map((p) => p.toData()),
    };
  }

  /**
   * Broadcasts an event to all clients in the room (or excluding a specific socket).
   */
  broadcast(io: Server, event: string, payload: any, excludeSocketId?: string) {
    if (excludeSocketId) {
      io.to(this.roomCode).except(excludeSocketId).emit(event, payload);
    } else {
      io.to(this.roomCode).emit(event, payload);
    }
  }

  /**
   * Broadcasts the full synchronized room state to all room members.
   */
  broadcastSyncState(io: Server) {
    io.to(this.roomCode).emit('sync_state', this.getSyncState());
  }
}
