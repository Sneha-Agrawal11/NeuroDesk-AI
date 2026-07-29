import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { setupWebSocket } from './websocket';
import { setupWatchers } from './workers/watcher.worker';

const PORT = process.env.SERVER_PORT || 3001;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
    ],
    credentials: true,
  }
});

// Setup WebSocket event handlers
setupWebSocket(io);

// Start the server
server.listen(PORT, () => {
  console.log(`[Server] NeuroDesk API running on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  
  // Start background file watchers
  setupWatchers();
});

// Handle graceful shutdown
const shutdown = () => {
  console.log('\n[Server] Shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Closed out remaining connections');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Safety net: without these, ANY unexpected error anywhere in the app
// (a bad request, a bug in a route, a rejected promise) kills the entire
// Node process - meaning the whole backend goes down and every feature
// stops working until it's manually restarted. Logging and continuing
// instead keeps the server alive so a single failing request doesn't
// take everything else down with it.
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception (server kept running):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled promise rejection (server kept running):', reason);
});
