export type ErrorClass = 'transient' | 'permanent';

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: unknown;
  readonly errorClass: ErrorClass;
  constructor(code: string, message: string, opts: { httpStatus?: number; details?: unknown; errorClass?: ErrorClass; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = opts.httpStatus ?? 400;
    this.details = opts.details;
    this.errorClass = opts.errorClass ?? 'permanent';
  }
}

export const notFound = (what: string, id?: string) =>
  new AppError('not_found', id ? `${what} ${id} not found` : `${what} not found`, { httpStatus: 404 });

export const validation = (message: string, details?: unknown) =>
  new AppError('validation_error', message, { httpStatus: 422, details });

export const conflict = (message: string, details?: unknown) =>
  new AppError('conflict', message, { httpStatus: 409, details });

export const approvalRequired = (message: string, details?: unknown) =>
  new AppError('approval_required', message, { httpStatus: 403, details });

export const transient = (message: string, cause?: unknown) =>
  new AppError('transient_failure', message, { httpStatus: 503, errorClass: 'transient', cause });

export const permanent = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, { httpStatus: 422, details, errorClass: 'permanent' });

export type ProviderErrorKind =
  | 'unconfigured'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'invalid_output'
  | 'refusal'
  | 'server'
  | 'bad_request'
  | 'budget_exceeded'
  | 'connection';

const RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set(['rate_limit', 'timeout', 'server', 'connection', 'invalid_output']);

export class ProviderError extends AppError {
  readonly kind: ProviderErrorKind;
  readonly provider: string;
  constructor(provider: string, kind: ProviderErrorKind, message: string, cause?: unknown) {
    super(`provider_${kind}`, `${provider}: ${message}`, {
      httpStatus: kind === 'unconfigured' ? 424 : 502,
      errorClass: RETRYABLE.has(kind) ? 'transient' : 'permanent',
      cause,
    });
    this.name = 'ProviderError';
    this.kind = kind;
    this.provider = provider;
  }
}

export function classifyError(err: unknown): ErrorClass {
  if (err instanceof AppError) return err.errorClass;
  const code = (err as { code?: string } | null)?.code;
  if (code && ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'EBUSY'].includes(code)) return 'transient';
  const msg = err instanceof Error ? err.message : String(err);
  if (/Target closed|Protocol error|Navigation timeout|browser has disconnected|SQLITE_BUSY/i.test(msg)) return 'transient';
  return 'permanent';
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
