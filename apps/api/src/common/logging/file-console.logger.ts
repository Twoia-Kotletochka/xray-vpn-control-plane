import { mkdirSync } from 'node:fs';
import { type WriteStream, createWriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';

type StructuredLogLevel = Exclude<LogLevel, 'fatal'> | 'fatal';

export class FileConsoleLogger extends ConsoleLogger {
  private readonly fileStream: WriteStream | null;

  constructor(levels?: LogLevel[], filePath = '/var/log/server-vpn/api.log') {
    super('ServerVpn', {
      logLevels: levels,
      timestamp: true,
    });

    this.fileStream = this.createStream(filePath);
  }

  override log(message: unknown, context?: string): void {
    super.log(message, context);
    this.writeEntry('log', message, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    super.error(message, stack, context);
    this.writeEntry('error', message, context, stack);
  }

  override warn(message: unknown, context?: string): void {
    super.warn(message, context);
    this.writeEntry('warn', message, context);
  }

  override debug(message: unknown, context?: string): void {
    super.debug(message, context);
    this.writeEntry('debug', message, context);
  }

  override verbose(message: unknown, context?: string): void {
    super.verbose(message, context);
    this.writeEntry('verbose', message, context);
  }

  override fatal(message: unknown, stack?: string, context?: string): void {
    super.fatal(message, stack, context);
    this.writeEntry('fatal', message, context, stack);
  }

  private createStream(filePath: string): WriteStream | null {
    try {
      mkdirSync(dirname(filePath), {
        recursive: true,
      });

      return createWriteStream(filePath, {
        flags: 'a',
      });
    } catch {
      return null;
    }
  }

  private writeEntry(
    level: StructuredLogLevel,
    message: unknown,
    context?: string,
    stack?: string,
  ) {
    if (!this.fileStream) {
      return;
    }

    this.fileStream.write(
      `${JSON.stringify({
        context: context ?? this.context,
        level,
        message: this.serializeMessage(message),
        stack,
        timestamp: new Date().toISOString(),
      })}\n`,
    );
  }

  private serializeMessage(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }

    if (message instanceof Error) {
      return message.message;
    }

    return JSON.stringify(message);
  }
}
