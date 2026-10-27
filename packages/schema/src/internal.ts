import type { z } from "zod";

// Zod schemas stay private to this package so the public contract is the builder API
// and `validateEntry`'s error shape, not Zod's.
const schemas = new WeakMap<object, z.ZodType>();

export function withSchema<T extends object>(target: T, schema: z.ZodType): T {
  schemas.set(target, schema);
  return target;
}

export function schemaOf(target: object): z.ZodType {
  const schema = schemas.get(target);
  if (!schema) throw new Error("Not a field, block or content type created by @cms/schema.");
  return schema;
}
