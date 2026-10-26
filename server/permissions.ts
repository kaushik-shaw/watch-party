import { Role, RoomAction } from './types';

/**
 * Role -> Allowed Events Matrix
 * Host has full control including role management and kicks.
 * Moderator can control playback, change video, and resolve requests.
 * Participant cannot perform privileged actions directly.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly RoomAction[]> = {
  host: [
    'play',
    'pause',
    'seek',
    'change_video',
    'assign_role',
    'remove_participant',
    'transfer_host',
    'resolve_request',
  ],
  moderator: ['play', 'pause', 'seek', 'change_video', 'resolve_request'],
  participant: [],
  viewer: [],
} as const;

/**
 * Checks whether a role is authorized to perform a given action.
 */
export function canPerform(role: Role, action: RoomAction): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  return Array.isArray(allowed) && allowed.includes(action);
}
