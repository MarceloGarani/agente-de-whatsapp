import express from 'express';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { webhookRouter } from './webhooks/whatsapp.handler.js';
import { authRouter } from './services/google-auth.js';
import { startScheduler } from './services/reminder.scheduler.js';

export const app = express();

app.use(express.json());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use(webhookRouter);
app.use(authRouter);

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(env.PORT, () => {
    logger.info({ service: 'server', action: 'start', port: env.PORT }, `Server running on port ${env.PORT}`);
    startScheduler();
  });

  function gracefulShutdown(signal: string) {
    logger.info({ service: 'server', action: 'shutdown', signal }, `Received ${signal}, shutting down gracefully`);
    server.close(() => {
      logger.info({ service: 'server', action: 'shutdown' }, 'Server closed');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
