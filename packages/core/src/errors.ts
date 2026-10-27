import type { DbErrorCode } from "@cms/db";
import type { FieldError } from "@cms/schema";

export type CommandErrorCode = "invalid_input" | "forbidden" | "unknown_content_type" | DbErrorCode;

/** An expected command failure with a stable code; the API maps codes to responses. */
export class CommandError extends Error {
  readonly code: CommandErrorCode;
  readonly fieldErrors: FieldError[];

  constructor(code: CommandErrorCode, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "CommandError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
