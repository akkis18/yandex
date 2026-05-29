import { Lead, LeadStatus, Taxipark, Driver } from '@prisma/client';
import { db } from '../database/client.js';
import { logger } from '../utils/logger.js';
import { TaxiparkService } from './taxipark.service.js';
import { formatLeadCard, formatLeadKeyboard } from '../utils/formatter.js';
import { BotContext } from '../types/context.js';

const contextName = 'LeadService';

// In-memory array fallback for local development when PostgreSQL is offline
const mockLeadsDb: Lead[] = [];
const mockDriversDb: Driver[] = [];

/**
 * Service Layer to handle Lead persistence, updates, and operator delivery notifications.
 */
export class LeadService {
  /**
   * Helper getter to access in-memory mock store for administrative statistics.
   */
  static getMockLeads(): Lead[] {
    return mockLeadsDb;
  }

  /**
   * Helper getter to access in-memory mock store for drivers.
   */
  static getMockDrivers(): Driver[] {
    return mockDriversDb;
  }

  /**
   * Persists a new lead into the PostgreSQL database.
   * Automatically falls back to in-memory storage if the database is offline in development.
   */
  static async createLead(data: {
    taxipark_id: string;
    fullname: string;
    phone: string;
    license_front_file_id: string;
    license_back_file_id: string;
    tex_passport_front_file_id: string;
    tex_passport_back_file_id: string;
  }): Promise<Lead> {
    try {
      logger.info(contextName, `Attempting to persist lead/driver in DB for: ${data.fullname}`);
      
      // Upsert into unique Driver database first
      await db.client.driver.upsert({
        where: { phone: data.phone },
        update: { fullname: data.fullname },
        create: { fullname: data.fullname, phone: data.phone },
      });

      return await db.client.lead.create({
        data: {
          taxipark_id: data.taxipark_id,
          fullname: data.fullname,
          phone: data.phone,
          license_front_file_id: data.license_front_file_id,
          license_back_file_id: data.license_back_file_id,
          tex_passport_front_file_id: data.tex_passport_front_file_id,
          tex_passport_back_file_id: data.tex_passport_back_file_id,
          status: 'NEW',
        },
      });
    } catch (error) {
      logger.error(contextName, `Database error creating lead/driver: ${data.fullname}`, error);

      // Offline mock fallback in development
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        logger.warn(contextName, 'Database is offline. Saving lead and driver in mock in-memory store.');
        
        // Mock driver upsert
        const existingDriverIndex = mockDriversDb.findIndex((d) => d.phone === data.phone);
        if (existingDriverIndex !== -1) {
          mockDriversDb[existingDriverIndex].fullname = data.fullname;
        } else {
          mockDriversDb.push({
            id: `mock-driver-${Math.random().toString(36).substring(2, 11)}`,
            fullname: data.fullname,
            phone: data.phone,
            created_at: new Date(),
          });
        }

        const mockLead: Lead = {
          id: `mock-lead-${Math.random().toString(36).substring(2, 11)}`,
          taxipark_id: data.taxipark_id,
          fullname: data.fullname,
          phone: data.phone,
          license_front_file_id: data.license_front_file_id,
          license_back_file_id: data.license_back_file_id,
          tex_passport_front_file_id: data.tex_passport_front_file_id,
          tex_passport_back_file_id: data.tex_passport_back_file_id,
          status: 'NEW',
          created_at: new Date(),
        };
        mockLeadsDb.push(mockLead);
        return mockLead;
      }
      throw error;
    }
  }

  /**
   * Retrieves a single lead by ID. Supports in-memory lookup.
   */
  static async getLeadById(leadId: string): Promise<Lead | null> {
    try {
      return await db.client.lead.findUnique({
        where: { id: leadId },
      });
    } catch (error) {
      logger.error(contextName, `Database error fetching lead ${leadId}`, error);

      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        const found = mockLeadsDb.find((l) => l.id === leadId);
        return found || null;
      }
      throw error;
    }
  }

  /**
   * Retrieves a single lead by Phone number. Supports in-memory lookup.
   */
  static async findLeadByPhone(phone: string): Promise<Lead | null> {
    try {
      return await db.client.lead.findFirst({
        where: { phone },
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      logger.error(contextName, `Database error fetching lead by phone: ${phone}`, error);

      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        const found = mockLeadsDb.find((l) => l.phone === phone);
        return found || null;
      }
      throw error;
    }
  }

  /**
   * Updates the status of an existing lead in the database or memory.
   */
  static async updateLeadStatus(leadId: string, status: LeadStatus): Promise<Lead> {
    try {
      logger.info(contextName, `Updating status of lead ${leadId} to ${status}`);
      return await db.client.lead.update({
        where: { id: leadId },
        data: { status },
      });
    } catch (error) {
      logger.error(contextName, `Database error updating lead status ${leadId}`, error);

      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        const index = mockLeadsDb.findIndex((l) => l.id === leadId);
        if (index !== -1) {
          mockLeadsDb[index] = { ...mockLeadsDb[index], status };
          return mockLeadsDb[index];
        }
        throw new Error(`Lead with ID ${leadId} not found in mock database.`);
      }
      throw error;
    }
  }

  /**
   * Handles driver registration completion:
   * 1. Persists data into database/mock database.
   * 2. Orchestrates delivery of operator notification.
   */
  static async handleRegistrationCompletion(
    ctx: BotContext,
    result: {
      fullname: string;
      phone: string;
      license_front_file_id: string;
      license_back_file_id: string | null;
      tex_passport_front_file_id: string | null;
      tex_passport_back_file_id: string | null;
    },
  ): Promise<void> {
    const parkId = ctx.session.taxiparkId || ctx.state.taxiparkId || 'default-park-id';

    try {
      // 1. Fetch Taxipark Context, fallback to first active or mock park if null
      let park = await TaxiparkService.findById(parkId);
      if (!park) {
        const allParks = await TaxiparkService.findAllActive().catch(() => []);
        if (allParks.length > 0) {
          park = allParks[0];
        }
      }

      if (!park) {
        park = {
          id: 'default-park-id',
          name: 'Yandex Premium Taxipark',
          slug: 'mvp_park',
          telegram_group_id: process.env.OPERATOR_GROUP_ID || '-100123456789',
          is_active: true,
          created_at: new Date(),
        };
      }

      // 2. Prepare Lead fields (Skipped steps are normalized to empty strings)
      const leadData = {
        taxipark_id: parkId,
        fullname: result.fullname,
        phone: result.phone,
        license_front_file_id: result.license_front_file_id,
        license_back_file_id: result.license_back_file_id || '',
        tex_passport_front_file_id: result.tex_passport_front_file_id || '',
        tex_passport_back_file_id: result.tex_passport_back_file_id || '',
      };

      // 3. Persist Lead
      let lead;
      try {
        lead = await this.createLead(leadData);
        logger.info(contextName, `Successfully persisted Lead ID "${lead.id}" for Taxipark "${park.name}"`);
      } catch (dbError) {
        logger.error(contextName, `Failed to persist lead in DB for driver: ${result.fullname}`, dbError);
        await ctx.reply(
          '⚠️ Arizangizni saqlashda xatolik yuz berdi. Iltimos, birozdan so\'ng qayta urinib ko\'ring.',
        );
        throw dbError; // Rethrow to halt the wizard flow
      }

      // 4. Dispatch Telegram Notification
      try {
        await this.notifyOperators(ctx, park, lead);
      } catch (deliveryError) {
        logger.error(
          contextName,
          `Gracefully handled operator notification delivery exception for Lead ID "${lead.id}". ` +
            `The lead was successfully saved in DB. Error:`,
          deliveryError,
        );
      }
    } catch (err) {
      logger.error(contextName, 'Error executing lead registration completion pipeline:', err);
    }
  }

  /**
   * Sends the structured operator card and uploaded documents as a group transaction.
   * Safe-wrapped to handle Telegram API failures gracefully.
   */
  static async notifyOperators(ctx: BotContext, taxipark: Taxipark, lead: Lead): Promise<void> {
    const groupId = taxipark.telegram_group_id;
    logger.info(contextName, `Dispatching notification for lead ${lead.id} to group ${groupId}`);

    try {
      // 1. Gather all non-empty uploaded document photo file_ids
      const mediaList: Array<{ type: 'photo'; media: string; caption: string }> = [];

      if (lead.license_front_file_id && lead.license_front_file_id.trim() !== '') {
        mediaList.push({
          type: 'photo',
          media: lead.license_front_file_id,
          caption: '🪪 Haydovchilik guvohnomasi (Oldi)',
        });
      }

      if (lead.license_back_file_id && lead.license_back_file_id.trim() !== '') {
        mediaList.push({
          type: 'photo',
          media: lead.license_back_file_id,
          caption: '🪪 Haydovchilik guvohnomasi (Orqasi)',
        });
      }

      if (lead.tex_passport_front_file_id && lead.tex_passport_front_file_id.trim() !== '') {
        mediaList.push({
          type: 'photo',
          media: lead.tex_passport_front_file_id,
          caption: '🚗 Texnik pasport (Oldi)',
        });
      }

      if (lead.tex_passport_back_file_id && lead.tex_passport_back_file_id.trim() !== '') {
        mediaList.push({
          type: 'photo',
          media: lead.tex_passport_back_file_id,
          caption: '🚗 Texnik pasport (Orqasi)',
        });
      }

      // 2. Send media group first (holds images)
      if (mediaList.length > 0) {
        try {
          logger.info(contextName, `Sending media group containing ${mediaList.length} photos...`);
          await ctx.telegram.sendMediaGroup(groupId, mediaList);
        } catch (mediaError) {
          logger.error(
            contextName,
            `Telegram API failed to send media group to chat ${groupId}. Continuing to send summary card...`,
            mediaError,
          );
        }
      }

      // 3. Send text summary card containing the active decision buttons below the images
      const cardText = formatLeadCard(lead, taxipark.name);
      const replyMarkup = formatLeadKeyboard(lead);

      await ctx.telegram.sendMessage(groupId, cardText, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      });

      logger.info(contextName, `Successfully notified operator group for lead ${lead.id}`);
    } catch (error) {
      logger.error(contextName, `Fatal operator notification failure for lead ${lead.id} in group ${groupId}`, error);
      throw error; // Re-throw to propagate back to handler
    }
  }

  /**
   * Automatically synchronizes all existing leads in the database into the unique Driver table.
   * This handles backfilling old registrations and ensures no data mismatch occurs.
   */
  static async syncExistingLeadsToDrivers(): Promise<void> {
    try {
      logger.info(contextName, 'Starting automatic synchronization of existing leads to unique drivers...');
      
      let leads: Lead[] = [];
      try {
        leads = await db.client.lead.findMany();
      } catch (err) {
        logger.error(contextName, 'Failed to fetch leads from DB during sync, possibly offline.', err);
        return;
      }
      
      logger.info(contextName, `Found ${leads.length} total leads to process.`);
      
      let syncCount = 0;
      for (const lead of leads) {
        try {
          await db.client.driver.upsert({
            where: { phone: lead.phone },
            update: { fullname: lead.fullname },
            create: { fullname: lead.fullname, phone: lead.phone, created_at: lead.created_at },
          });
          
          // Also backfill in-memory mock if offline/development
          const mockExists = mockDriversDb.some((d) => d.phone === lead.phone);
          if (!mockExists) {
            mockDriversDb.push({
              id: `sync-driver-${Math.random().toString(36).substring(2, 11)}`,
              fullname: lead.fullname,
              phone: lead.phone,
              created_at: lead.created_at,
            });
          }
          
          syncCount++;
        } catch (upsertErr) {
          logger.error(contextName, `Failed to upsert driver for phone ${lead.phone}`, upsertErr);
        }
      }
      logger.info(contextName, `Successfully synchronized ${syncCount} unique driver records.`);
    } catch (err) {
      logger.error(contextName, 'Error during automatic leads-to-drivers synchronization:', err);
    }
  }
}
