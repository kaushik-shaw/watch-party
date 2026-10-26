import { Server, Socket } from 'socket.io';
import { RoomManager } from './classes/RoomManager';
import { MessageHandler, SocketData } from './classes/MessageHandler';

/**
 * Registers WebSocket handlers on a newly connected socket.
 * Delegated to the OOP MessageHandler class.
 */
export function registerSocketHandlers(
  io: Server,
  socket: Socket<any, any, any, SocketData>,
  roomManager: RoomManager
): void {
  const handler = new MessageHandler(io, socket, roomManager);
  handler.register();
}
