export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private format(level: LogLevel, context: string, message: string): string {
    const ts = this.getTimestamp();
    const upperLevel = level.toUpperCase().padEnd(5);

    // ANSI escape codes for beautiful colors
    let colorLevel = upperLevel;
    switch (level) {
      case 'info':
        colorLevel = `\x1b[32m${upperLevel}\x1b[0m`; // Green
        break;
      case 'warn':
        colorLevel = `\x1b[33m${upperLevel}\x1b[0m`; // Yellow
        break;
      case 'error':
        colorLevel = `\x1b[31m${upperLevel}\x1b[0m`; // Red
        break;
      case 'debug':
        colorLevel = `\x1b[36m${upperLevel}\x1b[0m`; // Cyan
        break;
    }

    const styledContext = `\x1b[35m[${context}]\x1b[0m`; // Magenta
    return `[${ts}] [${colorLevel}] ${styledContext}: ${message}`;
  }

  info(context: string, message: string, ...args: unknown[]): void {
    console.log(this.format('info', context, message), ...args);
  }

  warn(context: string, message: string, ...args: unknown[]): void {
    console.warn(this.format('warn', context, message), ...args);
  }

  error(context: string, message: string, error?: unknown, ...args: unknown[]): void {
    console.error(this.format('error', context, message), ...args);
    if (error instanceof Error) {
      console.error(`\x1b[31m${error.stack}\x1b[0m`);
    } else if (error) {
      console.error('\x1b[31mContext details:\x1b[0m', error);
    }
  }

  debug(context: string, message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.format('debug', context, message), ...args);
    }
  }
}

export const logger = new Logger();
