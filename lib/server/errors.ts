/** Errors a driver call returns to the app as data: { ok: false, error: { code, message } }. */
export class DriverError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const denied = (message = "This app does not have permission to do that.") => new DriverError("permission_denied", message, 403);
export const notFound = (what = "Item") => new DriverError("not_found", `${what} not found.`, 404);
export const invalid = (message: string) => new DriverError("invalid_input", message, 400);
