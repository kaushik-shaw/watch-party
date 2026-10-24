import { Role, VideoAction } from './types';

/**
 * Role -> Allowed Events Matrix
 * Host & Moderator can control playback and change video.
 * Participant cannot change video or control playback.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly VideoAction[]> = {
  host: ['play', 'pause', 'seek', 'change_video'],
  moderator: ['play', 'pause', 'seek', 'change_video'],
  participant: [],
} as const;

/**
 * Checks whether a role is authorized to perform a given action.
 */
export function canPerform(role: Role, action: VideoAction): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  return Array.isArray(allowed) && allowed.includes(action);
}
