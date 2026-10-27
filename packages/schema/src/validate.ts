import type { z } from "zod";
import type { ContentType, EntryData } from "./define.js";
import { schemaOf } from "./internal.js";

export type FieldErrorCode =
  | "required"
  | "invalid_type"
  | "too_small"
  | "too_big"
  | "invalid_format"
  | "invalid_option"
  | "unknown_field"
  | "unknown_block"
  | "invalid";

export interface FieldError {
  path: (string | number)[];
  code: FieldErrorCode;
  message: string;
}

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: FieldError[] };

/** Validates one locale's entry data. Never throws for bad input; reports every error. */
export function validateEntry<T extends ContentType>(
  type: T,
  data: unknown,
): ValidationResult<EntryData<T>> {
  const result = schemaOf(type).safeParse(data, { reportInput: true });
  if (result.success) {
    return { ok: true, data: structuredClone(result.data) as EntryData<T> };
  }
  return { ok: false, errors: fieldErrorsFromZod(result.error) };
}

/**
 * Field-level errors for a failed Zod parse. Parse with `{ reportInput: true }` so a missing
 * value is reported as `required` rather than `invalid_type`.
 */
export function fieldErrorsFromZod(error: z.ZodError): FieldError[] {
  return error.issues.flatMap(toFieldErrors);
}

function toFieldErrors(issue: z.core.$ZodIssue): FieldError[] {
  const path = issue.path.map((p) => (typeof p === "number" ? p : String(p)));
  const error = (code: FieldErrorCode, message = issue.message): FieldError[] => [
    { path, code, message },
  ];
  switch (issue.code) {
    case "invalid_type":
      return path.length > 0 && issue.input === undefined
        ? error("required", "This field is required.")
        : error("invalid_type");
    case "too_small":
    case "too_big":
    case "invalid_format":
      return error(issue.code);
    case "invalid_value":
      return error("invalid_option");
    case "unrecognized_keys":
      return issue.keys.map((key) => ({
        path: [...path, key],
        code: "unknown_field",
        message: `Unknown field "${key}".`,
      }));
    case "invalid_union":
      return issue.discriminator !== undefined && issue.errors.length === 0
        ? error("unknown_block", "Unknown block type.")
        : error("invalid");
    default:
      return error("invalid");
  }
}
