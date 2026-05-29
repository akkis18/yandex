import { db } from '../database/client.js';
import { LeadService } from './lead.service.js';
import { logger } from '../utils/logger.js';
import { Lead, Driver } from '@prisma/client';

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
   * Fetches all unique drivers from database, or falls back to mock storage.
   */
  static async getAllDrivers(): Promise<Driver[]> {
    try {
      return await db.client.driver.findMany({
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      logger.error(contextName, 'Failed to fetch drivers from database', error);
      
      // Local development fallback
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        logger.warn(contextName, 'Pulling drivers from in-memory mock storage.');
        return LeadService.getMockDrivers();
      }
      return [];
    }
  }

  /**
   * Compiles and formats a detailed statistics report for registered drivers.
   */
  static async getStats(): Promise<string> {
    const leads = await this.getAllLeads();
    const drivers = await this.getAllDrivers();

    const totalLeads = leads.length;
    const totalDrivers = drivers.length;
    const newCount = leads.filter((l) => l.status === 'NEW').length;
    const contactedCount = leads.filter((l) => l.status === 'CONTACTED').length;
    const approvedCount = leads.filter((l) => l.status === 'APPROVED').length;
    const rejectedCount = leads.filter((l) => l.status === 'REJECTED').length;

    return (
      `📊 *Tizim Statistikasi / Lead & Driver Metrics*\n\n` +
      `• *Noyob haydovchilar soni (Baza):* \`${totalDrivers}\` ta\n` +
      `• *Jami yuborilgan arizalar soni:* \`${totalLeads}\` ta\n\n` +
      `• 🆕 *Yangi arizalar:* \`${newCount}\` ta\n` +
      `• 📞 *Aloqa o'rnatilganlar:* \`${contactedCount}\` ta\n` +
      `• ✅ *Tasdiqlanganlar (O'tgan):* \`${approvedCount}\` ta\n` +
      `• ❌ *Rad etilganlar:* \`${rejectedCount}\` ta`
    );
  }

  /**
   * Compiles the leads and drivers database and returns a downloadable buffer stream.
   * Completely in-memory without creating temp files on the system.
   */
  static async exportDrivers(): Promise<{ source: Buffer; filename: string } | null> {
    const leads = await this.getAllLeads();
    const drivers = await this.getAllDrivers();
    
    if (leads.length === 0 && drivers.length === 0) return null;

    let content = '==================================================\n';
    content += '          YANDEX TAXI DRIVER & LEAD DATABASE       \n';
    content += `          Generated: ${new Date().toLocaleString()}  \n`;
    content += '==================================================\n\n';

    content += '==================================================\n';
    content += '   1. NOYOB HAYDOVCHILAR BAZASI (UNIQUE DRIVERS)  \n';
    content += `   Jami noyob haydovchilar soni: ${drivers.length} ta\n`;
    content += '==================================================\n\n';

    if (drivers.length === 0) {
      content += 'Noyob haydovchilar hali mavjud emas.\n\n';
    } else {
      drivers.forEach((driver, i) => {
        content += `${i + 1}. HAYDOVCHI:\n`;
        content += `   Ism-familiya: ${driver.fullname}\n`;
        content += `   Telefon raqami: ${driver.phone}\n`;
        content += `   Yaratilgan sana: ${driver.created_at.toLocaleString()}\n`;
        content += '--------------------------------------------------\n';
      });
      content += '\n';
    }

    content += '==================================================\n';
    content += '   2. BARCHA ARIZALAR TARIXI (LEADS HISTORY)      \n';
    content += `   Jami arizalar soni: ${leads.length} ta\n`;
    content += '==================================================\n\n';

    if (leads.length === 0) {
      content += 'Arizalar hali mavjud emas.\n\n';
    } else {
      leads.forEach((lead, i) => {
        content += `${i + 1}. HAYDOVCHI ARIZASI (ID: ${lead.id})\n`;
        content += `   Ism-familiya: ${lead.fullname}\n`;
        content += `   Telefon raqami: ${lead.phone}\n`;
        content += `   Ro'yxatdan o'tgan sana: ${lead.created_at.toLocaleString()}\n`;
        content += `   Joriy status: ${lead.status}\n`;
        content += `   Hujjatlar:\n`;
        content += `     - Haydovchilik oldi: ${lead.license_front_file_id ? 'Yuklangan' : 'Yo\'q'}\n`;
        content += `     - Haydovchilik orqasi: ${lead.license_back_file_id && lead.license_back_file_id.trim() !== '' ? 'Yuklangan' : 'Yo\'q'}\n`;
        content += `     - Texnik pasport oldi: ${lead.tex_passport_front_file_id ? 'Yuklangan' : 'Yo\'q'}\n`;
        content += `     - Texnik pasport orqasi: ${lead.tex_passport_back_file_id && lead.tex_passport_back_file_id.trim() !== '' ? 'Yuklangan' : 'Yo\'q'}\n`;
        content += '--------------------------------------------------\n';
      });
    }

    const buffer = Buffer.from(content, 'utf-8');
    const dateStr = new Date().toISOString().slice(0, 10);
    return {
      source: buffer,
      filename: `haydovchilar_va_arizalar_${dateStr}.txt`,
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
