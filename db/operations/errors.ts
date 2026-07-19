/**
 * Error type for in-process operations. Mirrors the status semantics of the old
 * Supabase Edge Functions (400/403/404/409/500). Throwers stay 1:1 with the
 * original functions; callers handle as before.
 */
export class HttpError extends Error {
    status: number;
    data?: unknown;

    constructor(status: number, message: string, data?: unknown) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.data = data;
    }
}

export const httpError = (status: number, message: string, data?: unknown): HttpError =>
    new HttpError(status, message, data);
