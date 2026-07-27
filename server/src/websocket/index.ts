import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export const setupWebSocket = (io: Server) => {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string };
      (socket as any).user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    logger.info(`WebSocket connected: User ${user.email} (Socket ID: ${socket.id})`);
    
    // Join a room specific to the user for private updates
    socket.join(user.userId);
    
    socket.on('disconnect', () => {
      logger.info(`WebSocket disconnected: User ${user.email}`);
    });
    
    // Additional event handlers can be added here
  });
};
