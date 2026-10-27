export type DbErrorCode =
  | "invalid_name"
  | "invalid_time_zone"
  | "invalid_locale"
  | "invalid_default_locale"
  | "invalid_host"
  | "host_taken"
  | "primary_domain_exists"
  | "site_not_found"
  | "invalid_slug"
  | "invalid_type_key"
  | "parent_not_found"
  | "uri_taken";

/** An expected input or conflict error with a stable code; Feature 3 maps these to API errors. */
export class DbError extends Error {
  readonly code: DbErrorCode;

  constructor(code: DbErrorCode, message: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
  }
}

/** The name of the constraint a Postgres error violated, when it is one of `codes`. */
export function violatedConstraint(error: unknown, codes: string[]): string | undefined {
  // Drizzle wraps driver errors; the Postgres error is the cause.
  const pgError = error instanceof Error && error.cause ? error.cause : error;
  if (typeof pgError !== "object" || pgError === null) return undefined;
  const { code, constraint } = pgError as { code?: unknown; constraint?: unknown };
  return typeof code === "string" && codes.includes(code) && typeof constraint === "string"
    ? constraint
    : undefined;
}

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";
