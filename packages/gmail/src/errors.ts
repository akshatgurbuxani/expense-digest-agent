import {
  type AppError,
  MailHistoryExpiredError,
  UpstreamError,
  ValidationError,
} from "@expense/core";

export function mapGmailHttpError(status: number, body: string): AppError {
  if (status === 404) {
    return new MailHistoryExpiredError("Gmail history checkpoint expired");
  }
  if (status === 401 || status === 403) {
    return new UpstreamError(`Gmail API auth error (${status})`);
  }
  if (status >= 500) {
    return new UpstreamError(`Gmail API server error (${status})`);
  }
  return new ValidationError(`Gmail API error (${status}): ${body.slice(0, 200)}`);
}
