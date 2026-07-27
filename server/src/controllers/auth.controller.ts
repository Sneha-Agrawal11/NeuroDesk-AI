import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const client = new OAuth2Client(config.google.clientId);

export class AuthController {
  static async devSession(req: Request, res: Response) {
    try {
      const email = process.env.DEV_SESSION_EMAIL || 'dev@neurodesk.local';
      const name = process.env.DEV_SESSION_NAME || 'NeuroDesk Dev';
      const googleId = process.env.DEV_SESSION_GOOGLE_ID || 'dev-session-user';

      const user = await prisma.user.upsert({
        where: { email },
        update: {
          name,
          picture: '',
          lastLoginAt: new Date(),
        },
        create: {
          email,
          name,
          picture: '',
          googleId,
          lastLoginAt: new Date(),
        },
      });

      const workspace = await prisma.workspace.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          status: 'created'
        }
      });

      const readyWorkspace = await prisma.workspace.update({
        where: { id: workspace.id },
        data: { status: 'ready' }
      });

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
      );

      return res.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
          },
          workspace: {
            id: readyWorkspace.id,
            status: readyWorkspace.status,
            rootPath: readyWorkspace.rootPath,
            totalFiles: readyWorkspace.totalFiles,
            totalProjects: readyWorkspace.totalProjects,
            storageBytes: readyWorkspace.storageBytes,
            lastScanAt: readyWorkspace.lastScanAt,
          }
        }
      });
    } catch (error: any) {
      logger.error(`Dev session error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Failed to create dev session' });
    }
  }
  
  static async googleSignIn(req: Request, res: Response) {
    try {
      const { credential } = req.body;
      
      if (!credential) {
        return res.status(400).json({ success: false, error: 'No credential provided' });
      }

      // Verify Google token
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: config.google.clientId,
      });
      
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.status(401).json({ success: false, error: 'Invalid token payload' });
      }

      const { email, name, picture, sub: googleId } = payload;

      // Upsert user in database
      const user = await prisma.user.upsert({
        where: { email },
        update: {
          name: name || undefined,
          picture: picture || undefined,
          lastLoginAt: new Date(),
        },
        create: {
          email,
          name: name || '',
          picture: picture || '',
          googleId,
          lastLoginAt: new Date(),
        },
      });

      // Ensure a workspace exists for the user
      await prisma.workspace.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          status: 'created'
        }
      });

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
      );

      logger.info(`User signed in: ${user.email}`);

      return res.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture
          }
        }
      });
    } catch (error: any) {
      logger.error(`Auth error: ${error.message}`);
      return res.status(401).json({ success: false, error: 'Authentication failed' });
    }
  }

  static async getCurrentUser(req: Request, res: Response) {
    try {
      // req.user is set by the auth middleware
      const userId = (req as any).user.userId;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, picture: true }
      });
      
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      return res.json({ success: true, data: user });
    } catch (error: any) {
      logger.error(`Get user error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  }

  static async logout(req: Request, res: Response) {
    // Since we're using JWTs on the client, logout is mostly handled client-side
    // by destroying the token. We just return success here.
    return res.json({ success: true, message: 'Logged out successfully' });
  }
}
