import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRouter from './routes/auth';
import workspacesRouter from './routes/workspaces';
import agentsRouter from './routes/agents';
import ingestionRouter from './routes/ingestion';
import queryRouter from './routes/query';
import evaluationRouter from './routes/evaluation';
import autofixRouter from './routes/autofix';
import adminRouter from './routes/admin';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes (Targeting Base URL /api/v1)
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/workspaces', workspacesRouter);
app.use('/api/v1', agentsRouter);
app.use('/api/v1', ingestionRouter);
app.use('/api/v1', queryRouter);
app.use('/api/v1', evaluationRouter);
app.use('/api/v1', autofixRouter);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// 404 Route handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Error:', err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({ error: message });
});

export default app;
