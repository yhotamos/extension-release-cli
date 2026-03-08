/**
 * Parses and formats API error details from Chrome Web Store responses.
 */
export function parseStoreError(result: Record<string, unknown>, fallback: string): string {
  const err = result.error;
  if (!err || typeof err !== "object") return fallback;

  const error = err as Record<string, unknown>;
  const messages: string[] = [];

  if (error.message) messages.push(error.message as string);

  if (Array.isArray(error.details)) {
    for (const detail of error.details) {
      const type = ((detail["@type"] || detail.typeUrl) ?? "") as string;
      if (type.includes("BadRequest") && Array.isArray(detail.fieldViolations)) {
        for (const violation of detail.fieldViolations) {
          if (violation.description) messages.push(violation.description as string);
        }
      } else if (type.includes("LocalizedMessage") && detail.message) {
        messages.push(detail.message as string);
      } else if (type.includes("ErrorInfo") && detail.reason) {
        messages.push(`reason: ${detail.reason}`);
      }
    }
  }

  return messages.length > 0
    ? messages.join("\n  ")
    : `${fallback}: ${JSON.stringify(error)}`;
}
