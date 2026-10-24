import { Role, ParticipantData } from '../types';

export class Participant {
  public userId: string;
  public username: string;
  public socketId: string;
  public role: Role;
  public isOnline: boolean;
  public joinedAt: number;

  constructor(userId: string, username: string, socketId: string, role: Role = 'participant') {
    this.userId = userId;
    this.username = username;
    this.socketId = socketId;
    this.role = role;
    this.isOnline = true;
    this.joinedAt = Date.now();
  }

  updateSocketId(newSocketId: string) {
    this.socketId = newSocketId;
    this.isOnline = true;
  }

  toData(): ParticipantData {
    return {
      userId: this.userId,
      username: this.username,
      role: this.role,
      isOnline: this.isOnline,
      joinedAt: this.joinedAt,
    };
  }
}
