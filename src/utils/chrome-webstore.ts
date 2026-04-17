export type ErrorDetail = {
  '@type': string;
  reason?: string;
  domain?: string;
  metadata?: Record<string, string>;
  message?: string;
  fieldViolations?: Array<{
    field: string;
    description: string;
  }>;
};

export type ErrorResponse = {
  error: {
    code: number;
    message: string;
    status: string;
    details?: ErrorDetail[];
  };
};

export function parseStoreError(result: ErrorResponse, fallback: string): string {
  const err = result.error;
  if (!err) return fallback;

  const messages: string[] = [];
  let errorReason: string | null = null;

  if (err.message) {
    messages.push(err.message);
  }

  if (Array.isArray(err.details)) {
    for (const detail of err.details) {
      const type = detail['@type'] || '';
      if (type.includes('ErrorInfo') && detail.reason) {
        errorReason = detail.reason;
      } else if (type.includes('LocalizedMessage') && detail.message) {
        messages.push(detail.message);
      } else if (type.includes('BadRequest') && Array.isArray(detail.fieldViolations)) {
        for (const v of detail.fieldViolations) {
          if (v.description) messages.push(v.description);
        }
      }
    }
  }

  const uniqueMessages = Array.from(new Set(messages));

  const finalMessage = uniqueMessages.length > 0 ? uniqueMessages.join('\n') : fallback;

  return errorReason ? `[${errorReason}] ${finalMessage}` : finalMessage;
}

export function isErrorResponse(obj: unknown): obj is ErrorResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const { error } = obj as Record<string, unknown>;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}
