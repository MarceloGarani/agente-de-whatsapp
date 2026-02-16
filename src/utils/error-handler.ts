import { messages } from './messages.js';

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    public userMessage: string,
    public context?: string,
    public originalError?: Error,
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}

export function handleApiError(error: unknown, service: string): AppError {
  if (error instanceof AppError) return error;

  const err = error instanceof Error ? error : new Error(String(error));

  if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT') || err.message.includes('ENOTFOUND')) {
    return new AppError(
      'SERVICE_UNAVAILABLE',
      503,
      messages.errors.serviceUnavailable,
      service,
      err,
    );
  }

  if (err.message.includes('ECONNRESET')) {
    return new AppError(
      'CONNECTION_RESET',
      503,
      messages.errors.serviceUnavailable,
      service,
      err,
    );
  }

  if (err.message.includes('429')) {
    return new AppError(
      'RATE_LIMITED',
      429,
      messages.errors.serviceUnavailable,
      service,
      err,
    );
  }

  if (err.message.includes('401') || err.message.includes('403')) {
    return new AppError(
      'AUTH_ERROR',
      401,
      messages.errors.authError,
      service,
      err,
    );
  }

  if (err.message.includes('500') || err.message.includes('503')) {
    return new AppError(
      'SERVER_ERROR',
      503,
      messages.errors.serviceUnavailable,
      service,
      err,
    );
  }

  return new AppError(
    'INTERNAL_ERROR',
    500,
    messages.errors.generic,
    service,
    err,
  );
}
