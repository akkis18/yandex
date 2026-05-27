import { Prisma, Taxipark } from '@prisma/client';
import { db } from '../database/client.js';
import { logger } from '../utils/logger.js';

export class TaxiparkService {
  private static context = 'TaxiparkService';

  static async findById(id: string): Promise<Taxipark | null> {
    try {
      return await db.client.taxipark.findUnique({
        where: { id },
      });
    } catch (error) {
      logger.error(this.context, `Error finding taxipark by id: ${id}`, error);
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        logger.warn(this.context, `Database connection failed. Returning mock taxipark for ID "${id}"`);
        return {
          id: id || 'mock-park-id',
          name: 'Yandex Premium Taxipark',
          slug: 'mock_park',
          telegram_group_id: process.env.OPERATOR_GROUP_ID || '-100123456789',
          is_active: true,
          created_at: new Date(),
        };
      }
      throw error;
    }
  }

  static async findBySlug(slug: string): Promise<Taxipark | null> {
    try {
      return await db.client.taxipark.findUnique({
        where: { slug },
      });
    } catch (error) {
      logger.error(this.context, `Error finding taxipark by slug: ${slug}`, error);
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        logger.warn(this.context, `Database connection failed. Returning mock taxipark for Slug "${slug}"`);
        return {
          id: 'mock-park-id',
          name: 'Yandex Premium Taxipark',
          slug: slug || 'mock_park',
          telegram_group_id: process.env.OPERATOR_GROUP_ID || '-100123456789',
          is_active: true,
          created_at: new Date(),
        };
      }
      throw error;
    }
  }

  static async create(data: Prisma.TaxiparkCreateInput): Promise<Taxipark> {
    try {
      logger.info(this.context, `Creating taxipark: ${data.name} (slug: ${data.slug})`);
      return await db.client.taxipark.create({
        data,
      });
    } catch (error) {
      logger.error(this.context, `Error creating taxipark: ${data.name}`, error);
      throw error;
    }
  }

  static async update(id: string, data: Prisma.TaxiparkUpdateInput): Promise<Taxipark> {
    try {
      logger.info(this.context, `Updating taxipark: ${id}`);
      return await db.client.taxipark.update({
        where: { id },
        data,
      });
    } catch (error) {
      logger.error(this.context, `Error updating taxipark: ${id}`, error);
      throw error;
    }
  }

  static async delete(id: string): Promise<Taxipark> {
    try {
      logger.info(this.context, `Deleting taxipark: ${id}`);
      return await db.client.taxipark.delete({
        where: { id },
      });
    } catch (error) {
      logger.error(this.context, `Error deleting taxipark: ${id}`, error);
      throw error;
    }
  }

  static async findAllActive(): Promise<Taxipark[]> {
    try {
      return await db.client.taxipark.findMany({
        where: { is_active: true },
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      logger.error(this.context, 'Error fetching active taxiparks', error);
      throw error;
    }
  }

  static async findAll(params?: { skip?: number; take?: number }): Promise<Taxipark[]> {
    try {
      return await db.client.taxipark.findMany({
        skip: params?.skip,
        take: params?.take,
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      logger.error(this.context, 'Error fetching all taxiparks', error);
      throw error;
    }
  }
}
