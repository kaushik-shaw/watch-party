export type Role = 'host' | 'moderator' | 'participant';

export type VideoAction = 'play' | 'pause' | 'seek' | 'change_video';

export type RoomAction =
  | 'play'
  | 'pause'
  | 'seek'
  | 'change_video'
  | 'assign_role'
  | 'remove_participant'
  | 'transfer_host'
  | 'resolve_request';

export interface PlaybackState {
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  playbackRate?: number;
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
  roomId?: string;
  hostId: string;
  playback: PlaybackState;
  playState?: 'playing' | 'paused';
  isPlaying?: boolean;
  currentTime?: number;
  videoId?: string;
  participants: ParticipantData[];
}
