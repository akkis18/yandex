import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
import { logger } from '../utils/logger.js';

export function setupErrorHandler(bot: Telegraf<BotContext>): void {
  bot.catch(async (err: unknown, ctx: BotContext) => {
    const updateId = ctx.update?.update_id || 'unknown';
    logger.error('Bot:GlobalError', `Error occurred processing update #${updateId}`, err);

    try {
      // Notify the user of an internal error to prevent silent hangs
      if (ctx.chat) {
        await ctx.reply(
          '⚠️ Извините, произошла внутренняя ошибка сервера. Пожалуйста, попробуйте позже или обратитесь к администратору.',
        );
      }
    } catch (replyError) {
      logger.error('Bot:GlobalError', 'Failed to send user-facing error message', replyError);
    }
  });
}
