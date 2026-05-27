import http from 'http';
import { BotBootstrap } from './bot/bootstrap.js';
import { logger } from './utils/logger.js';

async function main() {
  const bootstrap = new BotBootstrap();
  await bootstrap.start();

  // Create a lightweight HTTP server for Render's port binding check
  // and to serve as a 24/7 awake ping endpoint via UptimeRobot
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('OK');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    logger.info('HttpServer', `Minimal health-check HTTP server listening on port ${port}`);
  });
}

main().catch((error) => {
  logger.error('Main', 'Fatal application crash', error);
  process.exit(1);
});
