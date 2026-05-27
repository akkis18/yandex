import { Telegraf, session, Scenes } from 'telegraf';
import { BotContext } from '../types/context.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { db } from '../database/client.js';
import { loggerMiddleware } from '../middlewares/logger.middleware.js';
import { startParamMiddleware } from '../middlewares/start-param.middleware.js';
import { setupErrorHandler } from '../middlewares/error.middleware.js';
import { registrationWizard } from '../scenes/registration.wizard.js';
import { RegistrationKeyboards } from '../keyboards/registration.keyboard.js';
import { adminMiddleware } from '../middlewares/admin.middleware.js';
import { LeadService } from '../services/lead.service.js';
import { TaxiparkService } from '../services/taxipark.service.js';
import { formatLeadCard, formatLeadKeyboard } from '../utils/formatter.js';
import { AdminService } from '../services/admin.service.js';

export class BotBootstrap {
  private bot: Telegraf<BotContext>;
  private context = 'BotBootstrap';

  constructor() {
    // 1. Initialize Telegraf Instance
    this.bot = new Telegraf<BotContext>(env.TELEGRAM_BOT_TOKEN);
    this.setupMiddlewares();
    this.setupCommands();
    this.setupActionHandlers();
    this.setupGracefulShutdown();
  }

  private setupMiddlewares(): void {
    logger.info(this.context, 'Configuring middlewares...');

    // Global Error Handler
    setupErrorHandler(this.bot);

    // 1. Logging Middleware (Runs first to time all updates)
    this.bot.use(loggerMiddleware);

    // 2. Session Middleware (Required by startParamMiddleware & Stage)
    this.bot.use(
      session({
        defaultSession: () => ({}),
      }),
    );

    // 3. Start Parameter Parser Middleware (Parses Deep links & Hydrates state)
    this.bot.use(startParamMiddleware);

    // 4. Stage Middleware (Registers Wizard/Base Scenes)
    const stage = new Scenes.Stage<BotContext>([registrationWizard]);
    this.bot.use(stage.middleware());

    // 5. Admin Protection Middleware for operator actions
    this.bot.use(adminMiddleware);
  }

  private setupCommands(): void {
    logger.info(this.context, 'Configuring bot commands...');

    // Helper function to check if user is a configured global admin
    const isAdmin = (userId?: number): boolean => {
      if (!userId) return false;
      const adminIds = (process.env.ADMIN_USER_IDS || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      return adminIds.includes(userId.toString());
    };

    // Start command trigger (MVP Direct start welcome with dynamic Admin Menu)
    this.bot.start(async (ctx) => {
      // 1. Only respond to private chats (ignore group triggers for safety)
      if (ctx.chat?.type !== 'private') return;

      const userId = ctx.from?.id;
      const park = ctx.state.taxipark;
      const parkName = park?.name || 'Yandex Premium Taxipark';

      // 2. If user is a global administrator, show customized Admin Keyboard
      if (isAdmin(userId)) {
        return ctx.reply(
          `👋 *Xush kelibsiz, Administrator!*\n\n` +
            `Siz bot boshqaruv paneliga kirdingiz. Quyidagi menyu orqali amallarni bajarishingiz mumkin:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [
                [{ text: '🚖 Haydovchi bo\'lish' }],
                [{ text: '📊 Statistika' }, { text: '📥 Haydovchilarni yuklash' }],
                [{ text: '⚙️ Sozlamalar' }],
              ],
              resize_keyboard: true,
            },
          },
        );
      }

      // 3. Normal private chat welcome for drivers
      return ctx.reply(
        `🚕 *"${parkName}"* avtoparkiga xush kelibsiz!\n\n` +
          `Biz sizni haydovchilarni ro'yxatdan o'tkazish botimizda ko'rib turganimizdan xursandmiz.\n` +
          `Ro'yxatdan o'tishni boshlash uchun quyidagi tugmani bosing yoki /register buyrug'ini yuboring.`,
        {
          parse_mode: 'Markdown',
          ...RegistrationKeyboards.startRegistration(),
        },
      );
    });

    // Command to launch the registration wizard
    this.bot.command('register', async (ctx) => {
      if (ctx.chat?.type !== 'private') return;
      return ctx.scene.enter('REGISTRATION_WIZARD');
    });

    // Hears to start registration from button
    this.bot.hears('🚖 Haydovchi bo\'lish', async (ctx) => {
      if (ctx.chat?.type !== 'private') return;
      return ctx.scene.enter('REGISTRATION_WIZARD');
    });

    // Admin Command triggers
    this.bot.command('admin', async (ctx) => {
      if (ctx.chat?.type !== 'private') return;
      if (!isAdmin(ctx.from?.id)) return;

      return ctx.reply(
        `👋 *Boshqaruv Paneli / Admin Menu*\n\nQuyidagi menyu orqali amallarni tanlang:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              [{ text: '🚖 Haydovchi bo\'lish' }],
              [{ text: '📊 Statistika' }, { text: '📥 Haydovchilarni yuklash' }],
              [{ text: '⚙️ Sozlamalar' }],
            ],
            resize_keyboard: true,
          },
        },
      );
    });

    // Hears button triggers for Admin Panel
    this.bot.hears('📊 Statistika', async (ctx) => {
      if (ctx.chat?.type !== 'private') return;
      if (!isAdmin(ctx.from?.id)) return;

      let loadingMsg: { message_id: number } | null = null;
      try {
        loadingMsg = await ctx.reply('⏳ *Ma\'lumotlar yuklanmoqda, iltimos kuting...*', { parse_mode: 'Markdown' });
        const stats = await AdminService.getStats();
        
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }
        await ctx.reply(stats, { parse_mode: 'Markdown' });
      } catch (err) {
        logger.error(this.context, 'Error loading stats in admin hears', err);
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }
        await ctx.reply('⚠️ Statistika ma\'lumotlarini yuklab bo\'lmadi.');
      }
    });

    this.bot.hears('📥 Haydovchilarni yuklash', async (ctx) => {
      if (ctx.chat?.type !== 'private') return;
      if (!isAdmin(ctx.from?.id)) return;

      let loadingMsg: { message_id: number } | null = null;
      try {
        loadingMsg = await ctx.reply('⏳ *Fayl shakllantirilmoqda, iltimos kuting...*', { parse_mode: 'Markdown' });
        await ctx.sendChatAction('upload_document');
        const fileObj = await AdminService.exportDrivers();

        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }

        if (!fileObj) {
          return ctx.reply('⚠️ Hozircha ro\'yxatdan o\'tgan haydovchilar mavjud emas.');
        }

        await ctx.replyWithDocument(fileObj);
      } catch (err) {
        logger.error(this.context, 'Error exporting leads in admin hears', err);
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }
        await ctx.reply('⚠️ Haydovchilar ro\'yxatini eksport qilib bo\'lmadi.');
      }
    });

    this.bot.hears('⚙️ Sozlamalar', async (ctx) => {
      if (ctx.chat?.type !== 'private') return;
      if (!isAdmin(ctx.from?.id)) return;

      let loadingMsg: { message_id: number } | null = null;
      try {
        loadingMsg = await ctx.reply('⏳ *Sozlamalar yuklanmoqda...*', { parse_mode: 'Markdown' });
        const settings = AdminService.getSettings();
        
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }
        await ctx.reply(settings, { parse_mode: 'Markdown' });
      } catch (err) {
        logger.error(this.context, 'Error loading settings in admin hears', err);
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }
        await ctx.reply('⚠️ Sozlamalar ma\'lumotlarini yuklab bo\'lmadi.');
      }
    });

    // Verification command to check current tenant context state/session
    this.bot.command('status', async (ctx) => {
      const park = ctx.state.taxipark;
      const sessionParkId = ctx.session.taxiparkId;

      const response =
        `📊 *Bot Context Status*\n\n` +
        `• *Session Park ID:* \`${sessionParkId || 'Not set'}\`\n` +
        `• *State Park ID:* \`${ctx.state.taxiparkId || 'Not set'}\`\n` +
        `• *State Park Name:* \`${park?.name || 'Not set'}\`\n` +
        `• *State Park Slug:* \`${park?.slug || 'Not set'}\`\n` +
        `• *Active Tenant:* \`${park?.is_active ? 'Yes' : 'No'}\``;

      return ctx.reply(response, { parse_mode: 'Markdown' });
    });

    this.bot.help((ctx) => {
      return ctx.reply(
        'ℹ️ *Bot bo\'yicha ma\'lumot*\n\n' +
          '• Taksoparkingizga bog\'lanish uchun `/start` parametri bo\'lgan havolani bosing\n' +
          '• Joriy taksopark seansini tekshirish uchun `/status` buyrug\'idan foydalaning',
        { parse_mode: 'Markdown' },
      );
    });
  }

  private setupActionHandlers(): void {
    logger.info(this.context, 'Configuring bot inline action handlers...');

    // 1. APPROVE ACTION
    this.bot.action(/^approve:(.+)$/, async (ctx) => {
      const leadId = ctx.match[1];
      const operator = ctx.from?.username || ctx.from?.first_name || 'operator';

      try {
        const lead = await LeadService.updateLeadStatus(leadId, 'APPROVED');
        logger.info(this.context, `Lead ${leadId} successfully APPROVED by @${operator}`);

        const park = await TaxiparkService.findById(lead.taxipark_id);
        const parkName = park?.name || 'Unknown Park';

        const updatedText = formatLeadCard(lead, parkName, operator);

        // Edit original text and remove keyboard to lock status
        await ctx.editMessageText(updatedText, {
          parse_mode: 'Markdown',
        });

        await ctx.answerCbQuery('✅ Ariza tasdiqlandi!');
      } catch (error) {
        logger.error(this.context, `Error approving lead ${leadId}`, error);
        await ctx.answerCbQuery('⚠️ Ariza holatini yangilab bo\'lmadi.');
      }
    });

    // 2. REJECT ACTION
    this.bot.action(/^reject:(.+)$/, async (ctx) => {
      const leadId = ctx.match[1];
      const operator = ctx.from?.username || ctx.from?.first_name || 'operator';

      try {
        const lead = await LeadService.updateLeadStatus(leadId, 'REJECTED');
        logger.info(this.context, `Lead ${leadId} successfully REJECTED by @${operator}`);

        const park = await TaxiparkService.findById(lead.taxipark_id);
        const parkName = park?.name || 'Unknown Park';

        const updatedText = formatLeadCard(lead, parkName, operator);

        // Edit original text and remove keyboard to lock status
        await ctx.editMessageText(updatedText, {
          parse_mode: 'Markdown',
        });

        await ctx.answerCbQuery('❌ Ariza rad etildi!');
      } catch (error) {
        logger.error(this.context, `Error rejecting lead ${leadId}`, error);
        await ctx.answerCbQuery('⚠️ Ariza holatini yangilab bo\'lmadi.');
      }
    });

    // 3. CONTACTED ACTION
    this.bot.action(/^contacted:(.+)$/, async (ctx) => {
      const leadId = ctx.match[1];
      const operator = ctx.from?.username || ctx.from?.first_name || 'operator';

      try {
        const lead = await LeadService.updateLeadStatus(leadId, 'CONTACTED');
        logger.info(this.context, `Lead ${leadId} marked as CONTACTED by @${operator}`);

        const park = await TaxiparkService.findById(lead.taxipark_id);
        const parkName = park?.name || 'Unknown Park';

        const updatedText = formatLeadCard(lead, parkName, operator);
        const updatedKeyboard = formatLeadKeyboard(lead);

        // Edit original text and render updated inline buttons
        await ctx.editMessageText(updatedText, {
          parse_mode: 'Markdown',
          reply_markup: updatedKeyboard,
        });

        await ctx.answerCbQuery('📞 Aloqa o\'rnatildi!');
      } catch (error) {
        logger.error(this.context, `Error marking lead ${leadId} as contacted`, error);
        await ctx.answerCbQuery('⚠️ Ariza holatini yangilab bo\'lmadi.');
      }
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(this.context, `Received signal ${signal}. Starting graceful shutdown...`);

      // Stop the bot first
      try {
        this.bot.stop(signal);
        logger.info(this.context, 'Telegram bot stopped successfully');
      } catch (err) {
        logger.error(this.context, 'Error stopping Telegram bot', err);
      }

      // Disconnect Database
      try {
        await db.disconnect();
      } catch (err) {
        logger.error(this.context, 'Error disconnecting database client', err);
      }

      logger.info(this.context, 'Graceful shutdown sequence completed. Exiting.');
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }

  public async start(): Promise<void> {
    try {
      logger.info(this.context, 'Initializing systems...');

      // 1. Connect to Database
      try {
        await db.connect();
      } catch (dbError) {
        if (env.NODE_ENV === 'development' || !env.NODE_ENV) {
          logger.warn(
            this.context,
            '⚠️ Database connection failed. Operating in OFFLINE/MOCK mode for local development.',
          );
        } else {
          throw dbError;
        }
      }

      // 2. Launch Bot
      logger.info(this.context, 'Launching Telegram bot...');
      await this.bot.launch();

      // Configure Telegram sidebar commands menu on successful launch
      try {
        await this.bot.telegram.setMyCommands([
          { command: 'start', description: 'Botni ishga tushirish / Bosh menyu' },
          { command: 'help', description: 'Yordam va ma\'lumotlar' },
          { command: 'admin', description: 'Boshqaruv paneli (Faqat adminlar)' },
        ]);
        logger.info(this.context, 'Telegram commands menu set successfully');
      } catch (cmdError) {
        logger.error(this.context, 'Failed to set Telegram commands menu', cmdError);
      }

      const botInfo = this.bot.botInfo;
      logger.info(
        this.context,
        `🚀 Telegram Bot successfully started! Running as @${botInfo?.username} (ID: ${botInfo?.id})`,
      );
    } catch (error) {
      logger.error(this.context, 'Initialization failure, stopping process', error);

      // Attempt clean up
      await db.disconnect();
      process.exit(1);
    }
  }
}
