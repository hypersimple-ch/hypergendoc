const RESET_PATH = "/api/auth/request-password-reset";
const GENERIC_RESET_BODY = {
  status: true,
  message:
    "If this email exists in our system, check your inbox shortly; delivery may be delayed",
};

/** Keeps account-existence and mail-queue failures indistinguishable to clients. */
export function normalizePasswordResetResponse(
  requestUrl: string,
  response: Response,
): { response: Response; suppressedFailure: boolean } {
  const path = new URL(requestUrl, "http://localhost").pathname;
  if (path !== RESET_PATH || (response.status >= 400 && response.status < 500))
    return { response, suppressedFailure: false };
  return {
    response: Response.json(GENERIC_RESET_BODY, { status: 200 }),
    suppressedFailure: response.status >= 500,
  };
}
