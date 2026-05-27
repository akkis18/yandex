import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

class DatabaseService {
  private static instance: DatabaseService;
  public client: PrismaClient;

  private constructor() {
    this.client = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    this.setupLogging();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private setupLogging(): void {
    // Bind prisma logs to custom logger with proper typescript-safe events
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const prismaAny = this.client as any;
    
    prismaAny.$on('query', (e: { query: string; params: string; duration: number }) => {
      logger.debug(
        'Prisma:Query',
        `${e.query} -- Params: ${e.params} -- Duration: ${e.duration}ms`,
      );
    });

    prismaAny.$on('info', (e: { message: string }) => {
      logger.info('Prisma:Info', e.message);
    });

    prismaAny.$on('warn', (e: { message: string }) => {
      logger.warn('Prisma:Warn', e.message);
    });

    prismaAny.$on('error', (e: { message: string }) => {
      logger.error('Prisma:Error', e.message);
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  public async connect(): Promise<void> {
    try {
      await this.client.$connect();
      logger.info('DatabaseService', 'Successfully connected to the database');
    } catch (error) {
      logger.error('DatabaseService', 'Failed to connect to the database', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.client.$disconnect();
      logger.info('DatabaseService', 'Successfully disconnected from the database');
    } catch (error) {
      logger.error('DatabaseService', 'Failed to disconnect from the database', error);
    }
  }
}

export const db = DatabaseService.getInstance();
