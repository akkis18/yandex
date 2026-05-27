import { BotContext } from '../types/context.js';
import { logger } from '../utils/logger.js';

const contextName = 'AdminMiddleware';

/**
 * Middleware to restrict driver registration approval and update actions to group operators or global administrators.
 */
export async function adminMiddleware(
  ctx: BotContext,
  next: () => Promise<void>,
): Promise<void> {
  // 1. Intercept only callback queries relating to lead operators/admin actions
  if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    const data = ctx.callbackQuery.data || '';
    
    if (
      data.startsWith('approve:') ||
      data.startsWith('reject:') ||
      data.startsWith('contacted:')
    ) {
      const chatId = ctx.chat?.id;
      const userId = ctx.from?.id;

      if (!chatId || !userId) {
        logger.warn(contextName, 'Admin action callback intercepted but chatId or userId is missing.');
        await ctx.answerCbQuery('⚠️ Ошибка идентификации пользователя/чата.');
        return;
      }

      // Check process environment for static global administrator list (comma-separated user IDs)
      const globalAdminIds = (process.env.ADMIN_USER_IDS || '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      const isGlobalAdmin = globalAdminIds.includes(userId.toString());

      if (isGlobalAdmin) {
        logger.info(contextName, `Global Admin access granted to user ${userId}`);
        return await next();
      }

      // 2. Query Telegram API to verify chat member status
      try {
        const member = await ctx.telegram.getChatMember(chatId, userId);
        const isOperator = member.status === 'administrator' || member.status === 'creator';

        if (isOperator) {
          logger.info(contextName, `Operator access granted to user ${userId} in group ${chatId}`);
          return await next();
        }

        logger.warn(
          contextName,
          `Access Denied: User ${userId} (status: "${member.status}") tried executing lead decision buttons in group ${chatId}.`,
        );

        // Alert the non-admin user using a pop-up alert box
        await ctx.answerCbQuery(
          '⛔ Kirish taqiqlandi!\n\nUshbu arizani boshqarish uchun siz ushbu guruh administratori (taksopark operatori) bo\'lishingiz kerak.',
          { show_alert: true },
        );
        return;
      } catch (err) {
        logger.error(
          contextName,
          `API error verifying operator status for user ${userId} in group ${chatId}`,
          err,
        );
        
        await ctx.answerCbQuery(
          '⚠️ Ushbu guruhda sizning ruxsatlaringizni tekshirib bo\'lmadi. Kirish vaqtincha bloklandi.',
          { show_alert: true },
        );
        return;
      }
    }
  }

  // Not an admin action callback: pass-through to next handler
  await next();
}
