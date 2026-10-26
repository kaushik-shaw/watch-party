import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Automatically load .env file if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(path.resolve(process.cwd(), '.env'));
    } catch {}
  }
  if (!process.env.DATABASE_URL) {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              let val = trimmed.slice(eqIdx + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
        });
      }
    } catch {}
  }
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

/**
 * Helper to retry transient database connection errors
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (i === retries) throw err;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  return null;
}

/**
 * Checks if PostgreSQL database is configured and reachable.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await withRetry(() => prisma.$queryRaw`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Persists or updates room state and metadata in PostgreSQL.
 */
export async function syncRoomToDb(roomData: {
  roomCode: string;
  hostId: string;
  title?: string;
  videoId?: string;
  currentTime?: number;
  isPlaying?: boolean;
  playbackRate?: number;
  status?: 'active' | 'paused' | 'ended';
  activeCount?: number;
  metadata?: {
    maxParticipants?: number;
    requiresApproval?: boolean;
    allowChat?: boolean;
    allowReactions?: boolean;
  };
}): Promise<void> {
  if (!process.env.DATABASE_URL || !prisma) return;
  try {
    await withRetry(async () => {
      await prisma.room.upsert({
        where: { roomCode: roomData.roomCode },
        update: {
          hostId: roomData.hostId,
          title: roomData.title !== undefined ? roomData.title : undefined,
          videoId: roomData.videoId !== undefined ? (roomData.videoId || null) : undefined,
          currentTime: roomData.currentTime !== undefined ? roomData.currentTime : undefined,
          isPlaying: roomData.isPlaying !== undefined ? roomData.isPlaying : undefined,
          playbackRate: roomData.playbackRate !== undefined ? roomData.playbackRate : undefined,
          status: roomData.status !== undefined ? roomData.status : undefined,
        },
        create: {
          roomCode: roomData.roomCode,
          hostId: roomData.hostId,
          title: roomData.title || 'YouTube Watch Party',
          videoId: roomData.videoId || null,
          currentTime: roomData.currentTime ?? 0,
          isPlaying: roomData.isPlaying ?? false,
          playbackRate: roomData.playbackRate ?? 1.0,
          status: roomData.status || 'active',
        },
      });

      // Upsert associated room metadata
      await prisma.roomMetadata.upsert({
        where: { roomCode: roomData.roomCode },
        update: {
          maxParticipants: roomData.metadata?.maxParticipants ?? 50,
          requiresApproval: roomData.metadata?.requiresApproval ?? true,
          allowChat: roomData.metadata?.allowChat ?? true,
          allowReactions: roomData.metadata?.allowReactions ?? true,
        },
        create: {
          roomCode: roomData.roomCode,
          maxParticipants: roomData.metadata?.maxParticipants ?? 50,
          requiresApproval: roomData.metadata?.requiresApproval ?? true,
          allowChat: roomData.metadata?.allowChat ?? true,
          allowReactions: roomData.metadata?.allowReactions ?? true,
        },
      });
    });
  } catch (err: any) {
    console.warn(`[DB Warning] Failed to sync room ${roomData.roomCode}:`, err.message);
  }
}

/**
 * Records or updates a participant record and tracks user sessions.
 */
export async function recordUserSession(sessionData: {
  userId: string;
  username: string;
  roomCode: string;
  socketId?: string;
  role?: 'host' | 'moderator' | 'participant' | 'viewer';
  userAgent?: string;
  activeCount?: number;
}): Promise<void> {
  if (!process.env.DATABASE_URL || !prisma) return;
  try {
    await withRetry(async () => {
      // 0. Ensure parent Room and Metadata exist so FK constraints never fail
      await prisma.room.upsert({
        where: { roomCode: sessionData.roomCode },
        update: { status: 'active' },
        create: {
          roomCode: sessionData.roomCode,
          hostId: sessionData.role === 'host' ? sessionData.userId : 'pending',
          title: 'YouTube Watch Party',
          currentTime: 0,
          isPlaying: false,
          playbackRate: 1.0,
          status: 'active',
        },
      });

      await prisma.roomMetadata.upsert({
        where: { roomCode: sessionData.roomCode },
        update: {},
        create: {
          roomCode: sessionData.roomCode,
          maxParticipants: 50,
          requiresApproval: true,
          allowChat: true,
          allowReactions: true,
        },
      });

      const dbRole: 'host' | 'moderator' | 'participant' =
        sessionData.role === 'viewer' ? 'participant' : (sessionData.role || 'participant');

      // 1. Upsert active participant
      await prisma.participant.upsert({
        where: {
          roomCode_userId: {
            roomCode: sessionData.roomCode,
            userId: sessionData.userId,
          },
        },
        update: {
          username: sessionData.username,
          role: dbRole,
          isOnline: true,
        },
        create: {
          roomCode: sessionData.roomCode,
          userId: sessionData.userId,
          username: sessionData.username,
          role: dbRole,
          isOnline: true,
        },
      });

      // 2. Cleanly manage audit user session (prevent runaway duplicates)
      if (sessionData.socketId) {
        await prisma.userSession.updateMany({
          where: {
            roomCode: sessionData.roomCode,
            userId: sessionData.userId,
            isOnline: true,
            socketId: { not: sessionData.socketId },
          },
          data: { isOnline: false, leftAt: new Date() },
        });

        const existingSession = await prisma.userSession.findFirst({
          where: { socketId: sessionData.socketId, roomCode: sessionData.roomCode },
        });

        if (existingSession) {
          await prisma.userSession.update({
            where: { id: existingSession.id },
            data: {
              isOnline: true,
              lastSeenAt: new Date(),
              role: dbRole,
              username: sessionData.username,
            },
          });
        } else {
          await prisma.userSession.create({
            data: {
              userId: sessionData.userId,
              username: sessionData.username,
              roomCode: sessionData.roomCode,
              socketId: sessionData.socketId,
              role: dbRole,
              isOnline: true,
              userAgent: sessionData.userAgent || null,
            },
          });
        }
      }

      // 3. Accurately compute peak participant count and unique total joins
      const activeOnlineCount =
        sessionData.activeCount ??
        (await prisma.participant.count({
          where: { roomCode: sessionData.roomCode, isOnline: true },
        }));

      const totalDistinctUsers = await prisma.participant.count({
        where: { roomCode: sessionData.roomCode },
      });

      const currentMeta = await prisma.roomMetadata.findUnique({
        where: { roomCode: sessionData.roomCode },
      });

      const newPeak = Math.max(currentMeta?.peakParticipantCount ?? 0, activeOnlineCount);
      const newTotalJoins = Math.max(totalDistinctUsers, currentMeta?.totalJoins ?? 0);

      await prisma.roomMetadata.upsert({
        where: { roomCode: sessionData.roomCode },
        update: {
          peakParticipantCount: newPeak,
          totalJoins: newTotalJoins,
        },
        create: {
          roomCode: sessionData.roomCode,
          maxParticipants: 50,
          peakParticipantCount: newPeak,
          totalJoins: newTotalJoins,
          requiresApproval: true,
          allowChat: true,
          allowReactions: true,
        },
      });
    });
  } catch (err: any) {
    console.warn(`[DB Warning] Failed to record user session for ${sessionData.username}:`, err.message);
  }
}

/**
 * Updates participant role in database.
 */
export async function updateParticipantRoleInDb(
  roomCode: string,
  userId: string,
  role: 'host' | 'moderator' | 'participant' | 'viewer'
): Promise<void> {
  if (!process.env.DATABASE_URL || !prisma) return;
  try {
    const dbRole = role === 'viewer' ? 'participant' : role;
    await prisma.participant.updateMany({
      where: { roomCode, userId },
      data: { role: dbRole },
    });
    await prisma.userSession.updateMany({
      where: { roomCode, userId, isOnline: true },
      data: { role: dbRole },
    });
  } catch (err: any) {
    console.warn(`[DB Warning] Failed to update role for ${userId}:`, err.message);
  }
}

/**
 * Deletes a participant from DB and marks active session ended.
 */
export async function deleteParticipantFromDb(roomCode: string, userId: string): Promise<void> {
  if (!process.env.DATABASE_URL || !prisma) return;
  try {
    await prisma.participant.deleteMany({
      where: { roomCode, userId },
    });
    await prisma.userSession.updateMany({
      where: { roomCode, userId, isOnline: true },
      data: { isOnline: false, leftAt: new Date() },
    });
  } catch (err: any) {
    console.warn(`[DB Warning] Failed to delete participant ${userId}:`, err.message);
  }
}

/**
 * Marks a user session and participant as offline upon departure.
 * If no active members remain in the room, sets the room status to 'ended'.
 */
export async function endUserSession(roomCode: string, userId: string, socketId?: string): Promise<void> {
  if (!process.env.DATABASE_URL || !prisma) return;
  try {
    await prisma.participant.updateMany({
      where: { roomCode, userId },
      data: { isOnline: false },
    });

    await prisma.userSession.updateMany({
      where: socketId
        ? { socketId, roomCode }
        : { userId, roomCode, isOnline: true },
      data: {
        isOnline: false,
        leftAt: new Date(),
      },
    });

    // Check remaining active participants in the room
    const activeRemaining = await prisma.participant.count({
      where: { roomCode, isOnline: true },
    });

    if (activeRemaining === 0) {
      await prisma.room.updateMany({
        where: { roomCode },
        data: { status: 'ended', isPlaying: false },
      });
    }
  } catch (err: any) {
    console.warn(`[DB Warning] Failed to end user session for ${userId}:`, err.message);
  }
}

/**
 * Explicitly marks a room as inactive/ended when closed.
 */
export async function markRoomInactiveInDb(roomCode: string): Promise<void> {
  if (!process.env.DATABASE_URL || !prisma) return;
  try {
    await prisma.room.updateMany({
      where: { roomCode },
      data: { status: 'ended', isPlaying: false },
    });
  } catch (err: any) {
    console.warn(`[DB Warning] Failed to mark room ${roomCode} inactive:`, err.message);
  }
}

/**
 * Loads a persistent room, its metadata, active participants, and recent messages.
 */
export async function loadRoomFromDb(roomCode: string) {
  if (!process.env.DATABASE_URL || !prisma) return null;
  try {
    return await prisma.room.findUnique({
      where: { roomCode },
      include: {
        metadata: true,
        participants: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
  } catch (err: any) {
    console.warn(`[DB Warning] Failed to load room ${roomCode}:`, err.message);
    return null;
  }
}

/**
 * Persists a chat message in PostgreSQL.
 */
export async function saveMessageToDb(data: {
  roomCode: string;
  userId: string;
  username: string;
  message: string;
}): Promise<void> {
  if (!process.env.DATABASE_URL || !prisma) return;
  try {
    await prisma.message.create({
      data: {
        roomCode: data.roomCode,
        userId: data.userId,
        username: data.username,
        message: data.message,
      },
    });
  } catch (err: any) {
    console.warn(`[DB Warning] Failed to save message:`, err.message);
  }
}
