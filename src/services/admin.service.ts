import { db } from '../database/client.js';
import { LeadService } from './lead.service.js';
import { logger } from '../utils/logger.js';
import { Lead } from '@prisma/client';

const contextName = 'AdminService';

/**
 * Service Layer to handle administrative queries, metrics, and lead list exports.
 */
export class AdminService {
  /**
   * Fetches all registered leads from database, or falls back to mock storage.
   */
  static async getAllLeads(): Promise<Lead[]> {
    try {
      return await db.client.lead.findMany({
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      logger.error(contextName, 'Failed to fetch leads from database', error);
      
      // Local development fallback
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        logger.warn(contextName, 'Pulling leads from in-memory mock storage.');
        return LeadService.getMockLeads();
      }
      return [];
    }
  }

  /**
   * Compiles and formats a detailed statistics report for registered drivers.
   */
  static async getStats(): Promise<string> {
    const leads = await this.getAllLeads();
    const total = leads.length;
    const newCount = leads.filter((l) => l.status === 'NEW').length;
    const contactedCount = leads.filter((l) => l.status === 'CONTACTED').length;
    const approvedCount = leads.filter((l) => l.status === 'APPROVED').length;
    const rejectedCount = leads.filter((l) => l.status === 'REJECTED').length;

    return (
      `📊 *Arizalar Statistikasi / Lead Metrics*\n\n` +
      `• *Jami ro'yxatdan o'tganlar:* \`${total}\` ta\n\n` +
      `• 🆕 *Yangi arizalar:* \`${newCount}\` ta\n` +
      `• 📞 *Aloqa o'rnatilganlar:* \`${contactedCount}\` ta\n` +
      `• ✅ *Tasdiqlanganlar (O'tgan):* \`${approvedCount}\` ta\n` +
      `• ❌ *Rad etilganlar:* \`${rejectedCount}\` ta`
    );
  }

  /**
   * Compiles the leads database and returns a downloadable buffer stream.
   * Completely in-memory without creating temp files on the system.
   */
  static async exportDrivers(): Promise<{ source: Buffer; filename: string } | null> {
    const leads = await this.getAllLeads();
    if (leads.length === 0) return null;

    let content = '==================================================\n';
    content += '          YANDEX TAXI LEAD DRIVER LIST             \n';
    content += `          Generated: ${new Date().toLocaleString()}  \n`;
    content += '==================================================\n\n';

    leads.forEach((lead, i) => {
      content += `${i + 1}. HAYDOVCHI ARIZASI (ID: ${lead.id})\n`;
      content += `   F.I.Sh. (Telegram): ${lead.fullname}\n`;
      content += `   Telefon raqami: ${lead.phone}\n`;
      content += `   Ro'yxatdan o'tgan sana: ${lead.created_at.toLocaleString()}\n`;
      content += `   Joriy status: ${lead.status}\n`;
      content += `   Hujjatlar:\n`;
      content += `     - Haydovchilik oldi: ${lead.license_front_file_id ? 'Yuklangan' : 'Yo\'q'}\n`;
      content += `     - Haydovchilik orqasi: ${lead.license_back_file_id && lead.license_back_file_id.trim() !== '' ? 'Yuklangan' : 'Yo\'q'}\n`;
      content += `     - Texnik pasport oldi: ${lead.tex_passport_front_file_id ? 'Yuklangan' : 'Yo\'q'}\n`;
      content += `     - Texnik pasport orqasi: ${lead.tex_passport_back_file_id && lead.tex_passport_back_file_id.trim() !== '' ? 'Yuklangan' : 'Yo\'q'}\n`;
      content += '--------------------------------------------------\n\n';
    });

    const buffer = Buffer.from(content, 'utf-8');
    const dateStr = new Date().toISOString().slice(0, 10);
    return {
      source: buffer,
      filename: `haydovchilar_${dateStr}.txt`,
    };
  }

  /**
   * Compiles and formats a detailed runtime configurations report.
   */
  static getSettings(): string {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const operatorGroupId = process.env.OPERATOR_GROUP_ID || 'Not set';
    const botToken = process.env.TELEGRAM_BOT_TOKEN ? '✅ Konfiguratsiya qilingan' : '❌ Sozlanmagan';
    const dbStatus =
      process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
        ? 'Resilient/Offline Development Mode'
        : 'PostgreSQL Production Mode';

    return (
      `⚙️ *Loyiha Sozlamalari / Bot Configurations*\n\n` +
      `• *Node Muhiti (Environment):* \`${nodeEnv}\`\n` +
      `• *Telegram Bot Token:* ${botToken}\n` +
      `• *Operatorlar Guruhi ID:* \`${operatorGroupId}\`\n` +
      `• *Baza holati:* \`${dbStatus}\`\n` +
      `• *Tizim vaqti:* \`${new Date().toLocaleString()}\``
    );
  }
}
