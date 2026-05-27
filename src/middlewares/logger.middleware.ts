import { BotContext } from '../types/context.js';
import { logger } from '../utils/logger.js';

export async function loggerMiddleware(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  const start = Date.now();
  const updateId = ctx.update.update_id;
  const updateType = ctx.updateType;

  const userId = ctx.from?.id || 'unknown';
  const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'unknown';

  let details = '';
  if (ctx.message && 'text' in ctx.message) {
    details = `text: "${ctx.message.text}"`;
  } else if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    details = `callbackQuery: "${ctx.callbackQuery.data}"`;
  }

  logger.info(
    'Bot:Update',
    `Incoming update #${updateId} [${updateType}] from user: ${username} (id: ${userId}) ${details}`,
  );

  try {
    await next();
  } finally {
    const duration = Date.now() - start;
    logger.info('Bot:Update', `Finished processing update #${updateId} in ${duration}ms`);
  }
}
