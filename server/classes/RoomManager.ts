import { Room } from './Room';
import { Participant } from './Participant';
import { Role } from '../types';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  /**
   * Generates a unique 6-character alphanumeric room code.
   */
  generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded ambiguous chars like I, O, 0, 1
    let code = '';
    let attempts = 0;
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
    } while (this.rooms.has(code) && attempts < 100);
    return code;
  }

  /**
   * Creates a new Room with the host registered.
   */
  createRoom(
    hostUserId: string,
    hostUsername: string,
    hostSocketId: string,
    customCode?: string
  ): Room {
    const code = customCode ? customCode.trim().toUpperCase() : this.generateCode();
    const existing = this.rooms.get(code);
    if (existing) {
      return existing;
    }
    const room = new Room(code, hostUserId, hostUsername, hostSocketId);
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Restores a persistent Room from database into active memory.
   */
  restoreRoomFromDb(data: {
    roomCode: string;
    hostId: string;
    videoId?: string | null;
    currentTime?: number | null;
    isPlaying?: boolean | null;
    playbackRate?: number | null;
    messages?: Array<{ id: string; userId: string; username: string; message: string; createdAt: Date }>;
  }): Room {
    const room = new Room(data.roomCode, data.hostId, 'Host', '');
    if (data.videoId) {
      room.playback.videoId = data.videoId;
    }
    room.playback.currentTime = data.currentTime ?? 0;
    room.playback.isPlaying = data.isPlaying ?? false;
    room.playback.playbackRate = data.playbackRate ?? 1.0;
    room.playback.updatedAt = Date.now();

    if (data.messages && Array.isArray(data.messages)) {
      const sorted = [...data.messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      sorted.forEach((m) => {
        room.addChatMessage({
          id: m.id,
          userId: m.userId,
          username: m.username,
          message: m.message,
          timestamp: new Date(m.createdAt).getTime(),
        });
      });
    }

    this.rooms.set(data.roomCode, room);
    return room;
  }

  /**
   * Retrieves a Room by its code.
   */
  getRoom(code: string): Room | undefined {
    if (!code) return undefined;
    return this.rooms.get(code.trim().toUpperCase());
  }

  /**
   * Deletes a Room.
   */
  deleteRoom(code: string): boolean {
    if (!code) return false;
    return this.rooms.delete(code.trim().toUpperCase());
  }

  /**
   * Finds the room and participant matching a socketId.
   */
  findRoomBySocketId(socketId: string): { room: Room; participant: Participant } | undefined {
    for (const room of this.rooms.values()) {
      const participant = room.getParticipantBySocketId(socketId);
      if (participant) {
        return { room, participant };
      }
    }
    return undefined;
  }

  /**
   * Finds the room and participant matching a userId.
   */
  findRoomByUserId(userId: string): { room: Room; participant: Participant } | undefined {
    for (const room of this.rooms.values()) {
      const participant = room.getParticipant(userId);
      if (participant) {
        return { room, participant };
      }
    }
    return undefined;
  }

  /**
   * Gets all active rooms.
   */
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}
