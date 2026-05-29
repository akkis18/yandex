import http from 'http';
import { BotBootstrap } from './bot/bootstrap.js';
import { logger } from './utils/logger.js';
import { db } from './database/client.js';

// Catch and log all unhandled promise rejections and uncaught exceptions in production
process.on('unhandledRejection', (reason) => {
  logger.error('UnhandledRejection', 'Unhandled promise rejection detected:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('UncaughtException', 'Uncaught exception detected:', error);
});

async function main() {
  // 1. Create and start HTTP server FIRST so Render detects the open port immediately
  const port = parseInt(process.env.PORT || '3000', 10);
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' || req.url === '/') {
      // Query the database on every health-check ping to keep Neon PostgreSQL awake 24/7
      try {
        await db.client.taxipark.findFirst().catch(() => null);
      } catch (dbErr) {
        logger.warn('HttpServer', 'Database keep-alive query failed (database might be connecting):', dbErr);
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('OK');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info('HttpServer', `Minimal health-check HTTP server listening on port ${port}`);
  });

  // 2. Start the Telegram Bot in parallel
  const bootstrap = new BotBootstrap();
  await bootstrap.start();
}

main().catch((error) => {
  logger.error('Main', 'Fatal application crash', error);
  process.exit(1);
});
