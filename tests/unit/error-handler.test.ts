import { AppError, handleApiError } from '../../src/utils/error-handler';
import { messages } from '../../src/utils/messages';

describe('Error Handler', () => {
  it('returns existing AppError unchanged', () => {
    const original = new AppError('TEST', 400, 'test message', 'test-service');
    const result = handleApiError(original, 'service');
    expect(result).toBe(original);
  });

  it('maps ECONNREFUSED to SERVICE_UNAVAILABLE', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:443');
    const result = handleApiError(err, 'calendar');
    expect(result.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.statusCode).toBe(503);
    expect(result.userMessage).toBe(messages.errors.serviceUnavailable);
    expect(result.context).toBe('calendar');
  });

  it('maps ETIMEDOUT to SERVICE_UNAVAILABLE', () => {
    const err = new Error('connect ETIMEDOUT');
    const result = handleApiError(err, 'drive');
    expect(result.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.userMessage).toBe(messages.errors.serviceUnavailable);
  });

  it('maps ENOTFOUND to SERVICE_UNAVAILABLE', () => {
    const err = new Error('getaddrinfo ENOTFOUND googleapis.com');
    const result = handleApiError(err, 'calendar');
    expect(result.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.userMessage).toBe(messages.errors.serviceUnavailable);
  });

  it('maps ECONNRESET to CONNECTION_RESET', () => {
    const err = new Error('read ECONNRESET');
    const result = handleApiError(err, 'drive');
    expect(result.code).toBe('CONNECTION_RESET');
    expect(result.statusCode).toBe(503);
    expect(result.userMessage).toBe(messages.errors.serviceUnavailable);
  });

  it('maps 429 rate limit to RATE_LIMITED', () => {
    const err = new Error('Request failed with status code 429');
    const result = handleApiError(err, 'openai');
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.statusCode).toBe(429);
    expect(result.userMessage).toBe(messages.errors.serviceUnavailable);
  });

  it('maps 401 to AUTH_ERROR', () => {
    const err = new Error('Request failed with status code 401');
    const result = handleApiError(err, 'google');
    expect(result.code).toBe('AUTH_ERROR');
    expect(result.statusCode).toBe(401);
    expect(result.userMessage).toBe(messages.errors.authError);
  });

  it('maps 403 to AUTH_ERROR', () => {
    const err = new Error('Request failed with status code 403');
    const result = handleApiError(err, 'google');
    expect(result.code).toBe('AUTH_ERROR');
  });

  it('maps 500 server error to SERVER_ERROR', () => {
    const err = new Error('Request failed with status code 500');
    const result = handleApiError(err, 'api');
    expect(result.code).toBe('SERVER_ERROR');
    expect(result.statusCode).toBe(503);
    expect(result.userMessage).toBe(messages.errors.serviceUnavailable);
  });

  it('maps 503 server error to SERVER_ERROR', () => {
    const err = new Error('Request failed with status code 503');
    const result = handleApiError(err, 'api');
    expect(result.code).toBe('SERVER_ERROR');
  });

  it('maps unknown errors to INTERNAL_ERROR', () => {
    const err = new Error('Something unexpected happened');
    const result = handleApiError(err, 'unknown');
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.statusCode).toBe(500);
    expect(result.userMessage).toBe(messages.errors.generic);
  });

  it('handles non-Error objects', () => {
    const result = handleApiError('string error', 'service');
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.originalError).toBeInstanceOf(Error);
  });

  it('preserves original error in the chain', () => {
    const original = new Error('Original cause');
    const result = handleApiError(original, 'service');
    expect(result.originalError).toBe(original);
  });
});
