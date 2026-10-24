export type Role = 'host' | 'moderator' | 'participant';

export type VideoAction = 'play' | 'pause' | 'seek' | 'change_video';

export interface PlaybackState {
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
}

export interface ParticipantData {
  userId: string;
  username: string;
  role: Role;
  isOnline: boolean;
  joinedAt: number;
}

export interface RoomSyncState {
  roomCode: string;
  hostId: string;
  playback: PlaybackState;
  participants: ParticipantData[];
}
