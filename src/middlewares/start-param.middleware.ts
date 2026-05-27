import { BotContext } from '../types/context.js';
import { TaxiparkService } from '../services/taxipark.service.js';
import { logger } from '../utils/logger.js';

export async function startParamMiddleware(
  ctx: BotContext,
  next: () => Promise<void>,
): Promise<void> {
  const contextName = 'StartParamMiddleware';

  // 1. Process new deep-linking parameters (e.g. /start park_123 or t.me/bot?start=park_123)
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text || '';

    if (text.startsWith('/start ')) {
      const payload = text.substring(7).trim(); // Extract "park_123"

      if (payload) {
        logger.info(contextName, `Detected start parameter deep link with payload: "${payload}"`);

        try {
          // Find park by slug first, then fallback to id
          let park = await TaxiparkService.findBySlug(payload);
          if (!park) {
            park = await TaxiparkService.findById(payload);
          }

          if (park) {
            if (park.is_active) {
              // Store in session (persists across updates)
              ctx.session.taxiparkId = park.id;

              // Store in state (active request context)
              ctx.state.taxiparkId = park.id;
              ctx.state.taxipark = park;

              logger.info(
                contextName,
                `Successfully resolved active taxipark: "${park.name}" (ID: ${park.id})`,
              );
            } else {
              logger.warn(contextName, `Resolved taxipark "${park.name}" is inactive`);
            }
          } else {
            logger.warn(contextName, `Failed to resolve taxipark for payload: "${payload}"`);
          }
        } catch (error) {
          logger.error(contextName, `Error processing start parameter payload "${payload}"`, error);
        }
      }
    }
  }

  // 2. Hydrate ctx.state if we already have a taxiparkId in session, but state isn't populated
  if (ctx.session?.taxiparkId && !ctx.state?.taxiparkId) {
    const cachedParkId = ctx.session.taxiparkId;
    try {
      const park = await TaxiparkService.findById(cachedParkId);
      if (park && park.is_active) {
        ctx.state.taxiparkId = park.id;
        ctx.state.taxipark = park;
      } else {
        // Clear invalid or inactive park from session
        logger.warn(
          contextName,
          `Session park ID "${cachedParkId}" is invalid or inactive. Clearing from session.`,
        );
        delete ctx.session.taxiparkId;
      }
    } catch (error) {
      logger.error(
        contextName,
        `Error hydrating taxipark from session ID "${cachedParkId}"`,
        error,
      );
    }
  }

  await next();
}
