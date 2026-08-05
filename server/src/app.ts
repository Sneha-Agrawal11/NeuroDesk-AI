import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

const app = express();

// Security and compression middlewares
// Default helmet CSP sets `frame-ancestors 'self'`, which blocks the
// frontend (localhost:3000) from embedding a file-preview <iframe> pointed
// at this backend (localhost:3001) - different origin, so 'self' doesn't
// match. Explicitly allow the frontend origin to frame us.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'frame-ancestors': ["'self'", 'http://localhost:3000', 'http://127.0.0.1:3000'],
    },
  },
}));
app.use(cors({
  origin: [
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
  ],
  credentials: true
}));
app.use(compression());

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    const safeBody = JSON.parse(JSON.stringify(body, (_, value) => {
      return typeof value === 'bigint' ? value.toString() : value;
    }));

    return originalJson(safeBody);
  }) as typeof res.json;

  next();
});

import routes from './routes';
app.use('/api', routes);


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'neurodesk-backend' });
});

// Basic error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong'
  });
});

export default app;
