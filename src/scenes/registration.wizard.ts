import { Scenes } from 'telegraf';
import { BotContext } from '../types/context.js';
import { RegistrationKeyboards } from '../keyboards/registration.keyboard.js';
import { logger } from '../utils/logger.js';
import { LeadService } from '../services/lead.service.js';

const contextName = 'RegistrationWizard';

/**
 * Helper function to check if user is a configured global admin.
 */
function isAdmin(userId?: number): boolean {
  if (!userId) return false;
  const adminIds = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return adminIds.includes(userId.toString());
}

/**
 * Checks if a text message is a cancellation request in Uzbek.
 */
function isCancel(text?: string): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return (
    normalized === '/cancel' ||
    normalized === "❌ bekor qilish"
  );
}

/**
 * Global helper to cancel the active registration flow, clear session, and notify user.
 * Dynamically restores the administrative dashboard if the user is an admin.
 */
async function handleCancellation(ctx: BotContext) {
  logger.info(contextName, `User ${ctx.from?.id} has cancelled the registration flow`);
  delete ctx.session.registration;

  const isUserAdmin = isAdmin(ctx.from?.id);

  if (isUserAdmin) {
    await ctx.reply(
      '❌ *Ro\'yxatdan o\'tish bekor qilindi.*\n\n' +
        'Boshqaruv paneliga qaytdingiz. Quyidagi menyu orqali amallarni bajarishingiz mumkin:',
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
  } else {
    await ctx.reply(
      '❌ *Ro\'yxatdan o\'tish bekor qilindi.*\n\n' +
        'Siz istalgan vaqtda quyidagi tugma yoki /register buyrug\'i orqali ro\'yxatdan o\'tishni qaytadan boshlashingiz mumkin.',
      {
        parse_mode: 'Markdown',
        ...RegistrationKeyboards.startRegistration(),
      },
    );
  }

  return ctx.scene.leave();
}

/**
 * The strictly mandatory 5-Step driver registration wizard scene in Uzbek.
 */
export const registrationWizard = new Scenes.WizardScene<BotContext>(
  'REGISTRATION_WIZARD',

  // ==========================================
  // STEP 1: Ask for phone number
  // ==========================================
  async (ctx) => {
    logger.info(contextName, `User ${ctx.from?.id} started registration wizard`);
    ctx.session.registration = {};

    await ctx.reply(
      '🚖 *1-qadam: Telefon raqami*\n\n' +
        'Iltimos, ro\'yxatdan o\'tkazmoqchi bo\'lgan telefon raqamingizni quyidagi ' +
        '"📱 Kontaktni ulashish" tugmasi orqali yuboring yoki qo\'lda +998XXXXXXXXX formatida kiriting.',
      {
        parse_mode: 'Markdown',
        ...RegistrationKeyboards.phone(),
      },
    );
    return ctx.wizard.next();
  },

  // ==========================================
  // STEP 2: Handle Phone & Ask for Driver License FRONT
  // ==========================================
  async (ctx) => {
    const message = ctx.message;
    if (!message) return;

    // Check cancellation
    const textVal = 'text' in message ? message.text : '';
    if (isCancel(textVal)) {
      await handleCancellation(ctx);
      return;
    }

    let phone = '';

    if ('contact' in message && message.contact) {
      phone = message.contact.phone_number;
    } else if ('text' in message && message.text) {
      const input = message.text.trim();
      const digitsOnly = input.replace(/[^0-9+]/g, '');
      if (digitsOnly.length >= 7 && digitsOnly.length <= 18) {
        phone = digitsOnly;
      }
    }

    if (!phone) {
      await ctx.reply(
        '⚠️ *Telefon raqami formati noto\'g\'ri!*\n\n' +
          'Iltimos, "📱 Kontaktni ulashish" tugmasidan foydalaning yoki ' +
          'telefon raqamingizni to\'g\'ri formatda kiriting (masalan, +998901234567).',
        {
          parse_mode: 'Markdown',
          ...RegistrationKeyboards.phone(),
        },
      );
      return; // Stay on Step 2 (Wait for valid phone)
    }

    ctx.session.registration = {
      phone,
    };

    // Auto-populate fullname from Telegram profile to satisfy database schema constraints
    const fullname = [ctx.from?.first_name, ctx.from?.last_name]
      .filter(Boolean)
      .join(' ') || 'Telegram User';
    ctx.session.registration.fullname = fullname;

    logger.info(contextName, `User ${ctx.from?.id} registered phone: ${phone}, fullname: ${fullname}`);

    await ctx.reply(
      '🚖 *2-qadam: Haydovchilik guvohnomasi (OLD TOMONI)*\n\n' +
        'Iltimos, haydovchilik guvohnomangiz old tomonining rasmini yuboring.',
      {
        parse_mode: 'Markdown',
        ...RegistrationKeyboards.requiredStep(),
      },
    );
    return ctx.wizard.next();
  },

  // ==========================================
  // STEP 3: Handle License FRONT & Ask for License BACK
  // ==========================================
  async (ctx) => {
    const message = ctx.message;
    if (!message) return;

    const textVal = 'text' in message ? message.text : '';
    if (isCancel(textVal)) {
      await handleCancellation(ctx);
      return;
    }

    if (!('photo' in message) || !message.photo || message.photo.length === 0) {
      await ctx.reply(
        '⚠️ *Rasm kutilmoqda!*\n\n' +
          'Iltimos, haydovchilik guvohnomangiz old tomonining aynan rasmini (hujjat yoki matn emas) yuboring.',
        {
          parse_mode: 'Markdown',
          ...RegistrationKeyboards.requiredStep(),
        },
      );
      return; // Stay on Step 3
    }

    const fileId = message.photo[message.photo.length - 1].file_id;
    ctx.session.registration!.license_front_file_id = fileId;
    logger.info(contextName, `User ${ctx.from?.id} uploaded license front: ${fileId}`);

    await ctx.reply(
      '🚖 *3-qadam: Haydovchilik guvohnomasi (ORQA TOMONI)*\n\n' +
        'Iltimos, haydovchilik guvohnomangiz orqa tomonining rasmini yuboring.',
      {
        parse_mode: 'Markdown',
        ...RegistrationKeyboards.requiredStep(),
      },
    );
    return ctx.wizard.next();
  },

  // ==========================================
  // STEP 4: Handle License BACK & Ask for Tex Passport FRONT
  // ==========================================
  async (ctx) => {
    const message = ctx.message;
    if (!message) return;

    const textVal = 'text' in message ? message.text : '';
    if (isCancel(textVal)) {
      await handleCancellation(ctx);
      return;
    }

    if (!('photo' in message) || !message.photo || message.photo.length === 0) {
      await ctx.reply(
        '⚠️ *Rasm kutilmoqda!*\n\n' +
          'Iltimos, haydovchilik guvohnomangiz orqa tomonining aynan rasmini yuboring.',
        {
          parse_mode: 'Markdown',
          ...RegistrationKeyboards.requiredStep(),
        },
      );
      return; // Stay on Step 4
    }

    const fileId = message.photo[message.photo.length - 1].file_id;
    ctx.session.registration!.license_back_file_id = fileId;
    logger.info(contextName, `User ${ctx.from?.id} uploaded license back: ${fileId}`);

    await ctx.reply(
      '🚖 *4-qadam: Avtomobil texnik pasporti (OLD TOMONI)*\n\n' +
        'Iltimos, avtomobil texnik pasportining (STS) old tomoni rasmini yuboring.',
      {
        parse_mode: 'Markdown',
        ...RegistrationKeyboards.requiredStep(),
      },
    );
    return ctx.wizard.next();
  },

  // ==========================================
  // STEP 5: Handle Tex Passport FRONT & Ask for Tex Passport BACK
  // ==========================================
  async (ctx) => {
    const message = ctx.message;
    if (!message) return;

    const textVal = 'text' in message ? message.text : '';
    if (isCancel(textVal)) {
      await handleCancellation(ctx);
      return;
    }

    if (!('photo' in message) || !message.photo || message.photo.length === 0) {
      await ctx.reply(
        '⚠️ *Rasm kutilmoqda!*\n\n' +
          'Iltimos, avtomobil texnik pasporti (STS) old tomonining aynan rasmini yuboring.',
        {
          parse_mode: 'Markdown',
          ...RegistrationKeyboards.requiredStep(),
        },
      );
      return; // Stay on Step 5
    }

    const fileId = message.photo[message.photo.length - 1].file_id;
    ctx.session.registration!.tex_passport_front_file_id = fileId;
    logger.info(contextName, `User ${ctx.from?.id} uploaded tex passport front: ${fileId}`);

    await ctx.reply(
      '🚖 *5-qadam: Avtomobil texnik pasporti (ORQA TOMONI)*\n\n' +
        'Iltimos, avtomobil texnik pasportining (STS) orqa tomoni rasmini yuboring.',
      {
        parse_mode: 'Markdown',
        ...RegistrationKeyboards.requiredStep(),
      },
    );
    return ctx.wizard.next();
  },

  // ==========================================
  // STEP 6: Handle Tex Passport BACK & Show Confirmation Summary
  // ==========================================
  async (ctx) => {
    const message = ctx.message;
    if (!message) return;

    const textVal = 'text' in message ? message.text : '';
    if (isCancel(textVal)) {
      await handleCancellation(ctx);
      return;
    }

    if (!('photo' in message) || !message.photo || message.photo.length === 0) {
      await ctx.reply(
        '⚠️ *Rasm kutilmoqda!*\n\n' +
          'Iltimos, avtomobil texnik pasportining orqa tomoni rasmini yuboring.',
        {
          parse_mode: 'Markdown',
          ...RegistrationKeyboards.requiredStep(),
        },
      );
      return; // Stay on Step 6
    }

    const fileId = message.photo[message.photo.length - 1].file_id;
    ctx.session.registration!.tex_passport_back_file_id = fileId;
    logger.info(contextName, `User ${ctx.from?.id} uploaded tex passport back: ${fileId}`);

    // Build the confirmation message summary in Uzbek
    const reg = ctx.session.registration!;
    const summary =
      '🚖 *Ma\'lumotlarni tasdiqlash*\n\n' +
      'Iltimos, yuborilgan ma\'lumotlaringiz to\'g\'riligini tekshiring:\n\n' +
      `• *Telefon raqami:* \`${reg.phone}\`\n` +
      `• *Guvohnoma old tomoni:* \`Yuklandi ✅\`\n` +
      `• *Guvohnoma orqa tomoni:* \`Yuklandi ✅\`\n` +
      `• *Texpasport old tomoni:* \`Yuklandi ✅\`\n` +
      `• *Texpasport orqa tomoni:* \`Yuklandi ✅\`\n\n` +
      'Agar barchasi to\'g\'ri bo\'lsa, *✅ Tasdiqlash* tugmasini bosing.\n' +
      'Tuzatish yoki bekor qilish uchun *❌ Bekor qilish* tugmasini bosing.';

    await ctx.reply(summary, {
      parse_mode: 'Markdown',
      ...RegistrationKeyboards.confirmation(),
    });
    return ctx.wizard.next();
  },

  // ==========================================
  // FINAL STEP: Process Confirmation Response
  // ==========================================
  async (ctx) => {
    const message = ctx.message;
    if (!message) return;

    const textVal = 'text' in message ? message.text : '';
    if (isCancel(textVal)) {
      await handleCancellation(ctx);
      return;
    }

    if (textVal.trim() === '✅ Tasdiqlash') {
      const reg = ctx.session.registration;
      if (!reg) {
        await ctx.reply('⚠️ Seans xatosi: ro\'yxatdan o\'tish ma\'lumotlari topilmadi.');
        return ctx.scene.leave();
      }

      // Structure final object to return (all document strings are guaranteed non-empty)
      const finalResult = {
        fullname: reg.fullname!,
        phone: reg.phone!,
        license_front_file_id: reg.license_front_file_id!,
        license_back_file_id: reg.license_back_file_id!,
        tex_passport_front_file_id: reg.tex_passport_front_file_id!,
        tex_passport_back_file_id: reg.tex_passport_back_file_id!,
      };

      logger.info(contextName, 'DRIVER REGISTRATION SUCCESSFUL - STRUCTURED RESULT:', finalResult);

      // Save registration result into session
      ctx.session.registrationResult = finalResult;

      // Save lead to database and notify operator group
      try {
        await LeadService.handleRegistrationCompletion(ctx, finalResult);
      } catch (deliveryError) {
        logger.error(contextName, 'Lead persistence/notification trigger failed.', deliveryError);
      }

      // Clear active flow registration session storage
      delete ctx.session.registration;

      const isUserAdmin = isAdmin(ctx.from?.id);

      const successMsg =
        `🎉 *Tabriklaymiz! Ro'yxatdan o'tish muvaffaqiyatli yakunlandi.*\n\n` +
        `Tez orada operatorimiz siz bilan bog'lanadi.\n\n\n` +
        `📲 🚖 *Yandex Pro (Taksometr) ilovasini yuklab olish:*\n\n` +
        `• *Play Market:*\n` +
        `https://play.google.com/store/apps/details?id=ru.yandex.taximeter\n\n` +
        `• *App Store:*\n` +
        `https://apps.apple.com/ru/app/id1496904594`;

      if (isUserAdmin) {
        await ctx.reply(
          `${successMsg}\n\n*Siz boshqaruv paneliga qaytdingiz:*`,
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
      } else {
        await ctx.reply(successMsg, {
          parse_mode: 'Markdown',
          reply_markup: { remove_keyboard: true },
        });
      }

      return ctx.scene.leave();
    }

    await ctx.reply(
      '⚠️ *Noma\'lum buyruq!*\n\n' +
        'Iltimos, ma\'lumotlarni tasdiqlash uchun *✅ Tasdiqlash* tugmasini bosing yoki bekor qiling.',
      {
        parse_mode: 'Markdown',
        ...RegistrationKeyboards.confirmation(),
      },
    );
  },
);

// Global cancellation inside the scene for extra security & stability
registrationWizard.command('cancel', handleCancellation);
registrationWizard.hears('❌ Bekor qilish', handleCancellation);
