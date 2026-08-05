import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { config } from '../config';
import { WorkspaceMemory } from '../utils/memory';

const prisma = new PrismaClient();
const AI_SERVICE_URL = config.ai.serviceUrl;

export class AIController {
  
  static async chat(req: AuthRequest, res: Response) {
    try {
      const { query, conversationId, provider, model, documentId, history: frontendHistory } = req.body;
      const userId = req.user!.userId;
      
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query is required' });
      }

      // 1. Resolve Conversation ID & History
      let history: any[] = Array.isArray(frontendHistory) ? frontendHistory : [];
      let convoId = conversationId;
      
      if (convoId) {
        const convo = await prisma.conversation.findUnique({ where: { id: convoId } });
        if (convo && convo.userId === userId) {
          history = JSON.parse(convo.messages);
        }
      } else {
        // Create new conversation
        const convo = await prisma.conversation.create({
          data: {
            userId,
            title: query.substring(0, 50),
            messages: '[]'
          }
        });
        convoId = convo.id;
      }

      res.setHeader('X-Conversation-Id', convoId);
      
      // 2. Fetch Workspace Memory
      const workspaceContext = await WorkspaceMemory.getRecentContext(userId);
      
      // 3. Search for Relevant Chunks (if query seems search-worthy, or just do it anyway).
      // When documentId is provided, retrieval is scoped to ONLY that file's chunks -
      // the assistant must never pull in unrelated (or benchmark) documents here.
      let retrievedChunks: any[] = [];
      try {
        const searchResponse = await axios.post(`${AI_SERVICE_URL}/internal/embed/search`, {
          query,
          limit: 10,
          filters: documentId ? { file_id: documentId } : undefined,
        });
        if (searchResponse.data.success) {
          retrievedChunks = searchResponse.data.results;
        }
      } catch (err) {
        logger.warn('Failed to retrieve semantic chunks for context builder');
      }

      // 3b. Document-scoped chat must never hallucinate: if we can't find any
      // indexed chunks belonging to this specific document, say so plainly
      // instead of asking Gemini to answer from unrelated context.
      if (documentId && retrievedChunks.length === 0) {
        const fallbackText = 'This information is not available in the current document.';

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(`data: ${fallbackText}\n\n`);
        res.write('data: [DONE]\n\n');

        const newHistory = [
          ...history,
          { role: 'user', content: query },
          { role: 'assistant', content: fallbackText }
        ];
        await prisma.conversation.update({
          where: { id: convoId },
          data: { messages: JSON.stringify(newHistory), updatedAt: new Date() }
        });

        return res.end();
      }

      // 4. Setup SSE for streaming response to frontend
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Stream from AI Service
      logger.info(`Proxying chat to ${AI_SERVICE_URL}/internal/chat/stream, provider=${provider || 'default'}, model=${model || 'default'}`);
      
      // Serialize safely to prevent any BigInt or circular reference crashes inside Axios
      const safePayload = JSON.parse(JSON.stringify({
        query,
        history,
        retrieved_chunks: retrievedChunks,
        workspace_context: workspaceContext,
        provider,
        model
      }, (_, v) => typeof v === 'bigint' ? v.toString() : v));

      const streamReq = await axios.post(`${AI_SERVICE_URL}/internal/chat/stream`, safePayload, {
        responseType: 'stream',
        timeout: 120000, // 2 minutes to prevent premature connection close
      });
      
      if (!streamReq.data || typeof streamReq.data.on !== 'function') {
        throw new Error('Upstream AI service did not return a valid stream');
      }
      
      let fullResponse = '';
      let buffer = '';
      
      streamReq.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        // Parse SSE lines from python service
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data !== '[DONE]' && !data.startsWith('[ERROR]')) {
               fullResponse += data;
            }
          }
        }
        res.write(chunk); // pass through to frontend
      });
      
      streamReq.data.on('end', async () => {
        if (buffer.trim()) {
          const leftoverLines = buffer.split('\n');
          for (const line of leftoverLines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data !== '[DONE]' && !data.startsWith('[ERROR]')) {
                fullResponse += data;
              }
            }
          }
        }

        try {
          // 5. Update Conversation History
          const newHistory = [
            ...history,
            { role: 'user', content: query },
            { role: 'assistant', content: fullResponse }
          ];
          
          await prisma.conversation.update({
            where: { id: convoId },
            data: {
              messages: JSON.stringify(newHistory),
              updatedAt: new Date()
            }
          });
          
          // Trigger background summary job if history is too long
          if (newHistory.length > 10) {
            try {
              const { mlQueue } = await import('../workers/queue');
              mlQueue.push({ type: 'summary', conversationId: convoId });
            } catch (err) {
              logger.warn('Failed to enqueue summary job');
            }
          }
        } catch (error: any) {
          logger.error(`Failed to update conversation history: ${error.message}`);
        } finally {
          res.end();
        }
      });

      streamReq.data.on('error', (err: any) => {
        logger.error(`Stream error during chat: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Chat stream interrupted' });
        } else {
          res.write(`data: [ERROR] Stream interrupted\n\n`);
          res.end();
        }
      });

    } catch (error: any) {
      logger.error(`Chat error: ${error.message}`);
      logger.error(`Full error stack: ${error.stack}`);
      if (error.response) {
        logger.error(`Upstream status: ${error.response.status}`);
      }
      if (!res.headersSent) {
        return res.status(500).json({ success: false, error: 'Chat processing failed' });
      }
      res.end();
    }
  }

  static async getConversations(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const convos = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, updatedAt: true }
      });
      return res.json({ success: true, data: convos });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
    }
  }
}
