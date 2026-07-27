import dotenv from 'dotenv';
import path from 'path';

// Load root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.SERVER_PORT || '3001', 10),
  
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod',
    expiresIn: process.env.JWT_EXPIRY || '7d',
  },
  
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'gemini',
    defaultModel: process.env.AI_DEFAULT_MODEL || 'gemini-2.0-flash',
  },
  
  workspace: {
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10),
    scanDepthLimit: parseInt(process.env.SCAN_DEPTH_LIMIT || '10', 10),
  }
};
