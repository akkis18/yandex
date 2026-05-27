import { Markup } from 'telegraf';

/**
 * Reusable keyboards for the driver registration wizard flow.
 * Provides a premium, highly responsive user interface with native Russian texts.
 */
export const RegistrationKeyboards = {
  /**
   * Keyboard for Step 1 (Phone Number Request).
   * Requesting contact using the Telegram button.
   */
  phone: () => {
    return Markup.keyboard([
      [Markup.button.contactRequest('📱 Kontaktni ulashish')],
      ['❌ Bekor qilish'],
    ]).resize();
  },

  /**
   * Keyboard for required steps.
   * Allows the user to cancel the registration flow at any time.
   */
  requiredStep: () => {
    return Markup.keyboard([
      ['❌ Bekor qilish'],
    ]).resize();
  },

  /**
   * Keyboard for final step (Confirmation).
   * Presents final decision buttons to confirm or cancel.
   */
  confirmation: () => {
    return Markup.keyboard([
      ['✅ Tasdiqlash'],
      ['❌ Bekor qilish'],
    ]).resize();
  },

  /**
   * Keyboard for prompting registration startup from /start.
   */
  startRegistration: () => {
    return Markup.keyboard([
      ['🚖 Haydovchi bo\'lish'],
    ]).resize();
  },
};
