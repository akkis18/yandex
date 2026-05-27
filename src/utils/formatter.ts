import { Markup } from 'telegraf';

/**
 * Escapes Telegram Markdown V1 reserved characters (*, _, `, [) to prevent rendering crashes.
 */
export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/([*_`[])/g, '\\$1');
}

/**
 * Formats phone numbers cleanly into standard +998 (XX) XXX-XX-XX format for Uzbek phones,
 * or returns the raw input for other international phones.
 */
export function formatPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[^0-9]/g, '');
  
  // Uzbek phone format: 998901234567
  if (cleaned.length === 12 && cleaned.startsWith('998')) {
    return `+998 (${cleaned.substring(3, 5)}) ${cleaned.substring(5, 8)}-${cleaned.substring(8, 10)}-${cleaned.substring(10, 12)}`;
  } else if (cleaned.length === 9) {
    return `+998 (${cleaned.substring(0, 2)}) ${cleaned.substring(2, 5)}-${cleaned.substring(5, 7)}-${cleaned.substring(7, 9)}`;
  }
  
  // Fallback to original
  return phone.startsWith('+') ? phone : `+${phone}`;
}

/**
 * Formats Date objects into standard Russian/Uzbek timestamp format: DD.MM.YYYY HH:MM.
 */
export function formatDate(date: Date): string {
  if (!date) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Generates the operator notification card text in Uzbek.
 */
export function formatLeadCard(
  lead: {
    id: string;
    fullname: string;
    phone: string;
    status: string;
    created_at: Date;
  },
  taxiparkName: string,
  operatorUsername?: string,
): string {
  const statusLabels: Record<string, string> = {
    NEW: '🆕 Yangi',
    CONTACTED: '📞 Aloqa o\'rnatildi',
    APPROVED: '✅ Tasdiqlangan',
    REJECTED: '❌ Rad etilgan',
  };

  const statusStr = statusLabels[lead.status] || lead.status;
  const formattedPhone = formatPhone(lead.phone);
  const formattedDate = formatDate(new Date(lead.created_at));

  let text =
    `📥 *Yangi haydovchi arizasi!*\n\n` +
    `• *F.I.Sh. (Telegram):* \`${escapeMarkdown(lead.fullname)}\`\n` +
    `• *Telefon raqami:* \`${escapeMarkdown(formattedPhone)}\`\n` +
    `• *Ro'yxatdan o'tgan sana:* \`${formattedDate}\`\n` +
    `• *Joriy holat:* *${statusStr}*\n\n` +
    `⚡ *Ariza ID:* \`${lead.id}\`\n`;

  if (operatorUsername) {
    const actionLabel =
      lead.status === 'CONTACTED'
        ? 'aloqa o\'rnatdi'
        : lead.status === 'APPROVED'
          ? 'arizani tasdiqladi'
          : 'arizani rad etdi';
    text += `\n👤 *Operator:* @${escapeMarkdown(operatorUsername)} (${actionLabel})\n`;
  }

  return text;
}

/**
 * Generates context-aware inline reply keyboards in Uzbek.
 * Locks the keyboard once a final decision (APPROVE/REJECT) is rendered.
 */
export function formatLeadKeyboard(lead: { id: string; status: string }) {
  if (lead.status === 'NEW') {
    return Markup.inlineKeyboard([
      [Markup.button.callback('📞 Aloqa o\'rnatildi', `contacted:${lead.id}`)],
      [
        Markup.button.callback('✅ Tasdiqlash', `approve:${lead.id}`),
        Markup.button.callback('❌ Rad etish', `reject:${lead.id}`),
      ],
    ]).reply_markup;
  } else if (lead.status === 'CONTACTED') {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Tasdiqlash', `approve:${lead.id}`),
        Markup.button.callback('❌ Rad etish', `reject:${lead.id}`),
      ],
    ]).reply_markup;
  }
  // LOCKED: No buttons show up once approved or rejected
  return undefined;
}
