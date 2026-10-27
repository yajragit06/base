import { z } from "zod";
import { schemaOf, withSchema } from "./internal.js";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface AdminHints {
  label?: string;
  help?: string;
  group?: string;
}

export type FieldKind =
  | "text"
  | "richText"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "select"
  | "media"
  | "entry"
  | "slug"
  | "json"
  | "repeater"
  | "blocks"
  | "seo";

/**
 * A field definition. `V` is the value type; `P` is true when the value is always present
 * after validation (the field is required or has a default).
 */
export interface Field<V = unknown, P extends boolean = boolean> {
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly default: V | undefined;
  readonly localized: boolean;
  readonly admin: AdminHints;
  readonly __type?: { value: V; present: P };
}

export type Fields = { readonly [key: string]: Field };

export interface CommonOptions<V> {
  required?: boolean;
  default?: V;
  localized?: boolean;
  admin?: AdminHints;
}

type NoOptions = Record<never, never>;

type Present<O> = O extends { required: true }
  ? true
  : O extends { default: unknown }
    ? true
    : false;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type ValueOf<F> = F extends Field<infer V, boolean> ? V : never;

type PresentKeys<F extends Fields> = {
  [K in keyof F]: F[K] extends Field<unknown, true> ? K : never;
}[keyof F];

/** The validated data shape of a field set. */
export type FieldsData<F extends Fields> = Simplify<
  { [K in PresentKeys<F>]: ValueOf<F[K]> } & {
    [K in Exclude<keyof F, PresentKeys<F>>]?: ValueOf<F[K]>;
  }
>;

export interface Block<K extends string = string, F extends Fields = Fields> {
  readonly key: K;
  readonly label?: string;
  readonly fields: F;
}

type BlockData<B> =
  B extends Block<infer K, infer F> ? Simplify<{ type: K } & FieldsData<F>> : never;

export interface SeoValue {
  title?: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
}

interface TextOptions extends CommonOptions<string> {
  min?: number;
  max?: number;
}

interface NumberOptions extends CommonOptions<number> {
  min?: number;
  max?: number;
  integer?: boolean;
}

interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface SelectOptions extends CommonOptions<string | readonly string[]> {
  options: readonly SelectOption[];
  multiple?: boolean;
}

type SelectValue<O extends SelectOptions> = O extends { multiple: true }
  ? O["options"][number]["value"][]
  : O["options"][number]["value"];

interface JsonOptions extends CommonOptions<JsonValue> {
  schema?: z.ZodType;
}

type JsonFieldValue<O extends JsonOptions> = O extends { schema: z.ZodType<infer T> }
  ? T
  : JsonValue;

interface RepeaterOptions extends CommonOptions<readonly object[]> {
  fields: Fields;
  min?: number;
  max?: number;
}

interface BlocksOptions extends CommonOptions<readonly object[]> {
  of: readonly Block[];
  min?: number;
  max?: number;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY = /^[a-z][a-zA-Z0-9]*$/;

function make<V, P extends boolean>(
  kind: FieldKind,
  opts: CommonOptions<unknown> | undefined,
  schema: z.ZodType,
): Field<V, P> {
  const field: Field<V, P> = {
    kind,
    required: opts?.required ?? false,
    default: opts?.default as V | undefined,
    localized: opts?.localized ?? false,
    admin: opts?.admin ?? {},
  };
  return withSchema(field, schema);
}

function withLength<S extends z.ZodString | z.ZodNumber>(
  schema: S,
  opts: { min?: number; max?: number },
): S {
  let s = schema;
  if (opts.min !== undefined) s = s.min(opts.min) as S;
  if (opts.max !== undefined) s = s.max(opts.max) as S;
  return s;
}

function withCount<T extends z.ZodType>(
  schema: z.ZodArray<T>,
  opts: { min?: number; max?: number },
): z.ZodArray<T> {
  let s = schema;
  if (opts.min !== undefined) s = s.min(opts.min);
  if (opts.max !== undefined) s = s.max(opts.max);
  return s;
}

export function assertKey(kind: string, key: string): void {
  if (!KEY.test(key)) {
    throw new Error(
      `Invalid ${kind} key "${key}": use camelCase letters and digits, starting with a lowercase letter.`,
    );
  }
}

/** Checks a field set and fails loudly on definition mistakes. */
export function assertFields(owner: string, fields: Fields, nested: boolean): void {
  const entries = Object.entries(fields);
  if (entries.length === 0) throw new Error(`${owner} must define at least one field.`);
  for (const [key, f] of entries) {
    assertKey("field", key);
    if (nested && f.localized) {
      throw new Error(
        `Field "${key}" in ${owner} cannot be localized: only top-level fields can be.`,
      );
    }
    if (f.default !== undefined && !schemaOf(f).safeParse(f.default).success) {
      throw new Error(`Field "${key}" in ${owner} has a default that fails its own validation.`);
    }
  }
}

/** The strict object schema for a field set, with defaults and optional fields applied. */
export function objectShape(fields: Fields): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, f] of Object.entries(fields)) {
    const s = schemaOf(f);
    if (f.default !== undefined) {
      const value = f.default;
      shape[key] = s.default(() => structuredClone(value));
    } else {
      shape[key] = f.required ? s : s.optional();
    }
  }
  return shape;
}

function text<const O extends TextOptions = NoOptions>(opts?: O): Field<string, Present<O>> {
  return make("text", opts, withLength(z.string(), opts ?? {}));
}

function richText<const O extends CommonOptions<{ [key: string]: JsonValue }> = NoOptions>(
  opts?: O,
): Field<{ [key: string]: JsonValue }, Present<O>> {
  return make("richText", opts, z.record(z.string(), z.json()));
}

function number<const O extends NumberOptions = NoOptions>(opts?: O): Field<number, Present<O>> {
  const base = opts?.integer ? z.int() : z.number();
  return make("number", opts, withLength(base, opts ?? {}));
}

function boolean<const O extends CommonOptions<boolean> = NoOptions>(
  opts?: O,
): Field<boolean, Present<O>> {
  return make("boolean", opts, z.boolean());
}

function date<const O extends CommonOptions<string> = NoOptions>(
  opts?: O,
): Field<string, Present<O>> {
  return make("date", opts, z.iso.date());
}

function datetime<const O extends CommonOptions<string> = NoOptions>(
  opts?: O,
): Field<string, Present<O>> {
  return make("datetime", opts, z.iso.datetime({ offset: true }));
}

function select<const O extends SelectOptions>(opts: O): Field<SelectValue<O>, Present<O>> {
  const [first, ...rest] = opts.options.map((o) => o.value);
  if (first === undefined) throw new Error("A select field needs at least one option.");
  const value = z.enum([first, ...rest]);
  return make("select", opts, opts.multiple ? z.array(value) : value);
}

function media<const O extends CommonOptions<string> = NoOptions>(
  opts?: O,
): Field<string, Present<O>> {
  return make("media", opts, z.string().min(1));
}

function entry<const O extends CommonOptions<string> = NoOptions>(
  opts?: O,
): Field<string, Present<O>> {
  return make("entry", opts, z.string().min(1));
}

function slug<const O extends CommonOptions<string> = NoOptions>(
  opts?: O,
): Field<string, Present<O>> {
  return make("slug", opts, z.string().regex(SLUG, "Use lowercase letters, digits and hyphens."));
}

function json<const O extends JsonOptions = NoOptions>(
  opts?: O,
): Field<JsonFieldValue<O>, Present<O>> {
  return make("json", opts, opts?.schema ?? z.json());
}

function repeater<const O extends RepeaterOptions>(
  opts: O,
): Field<FieldsData<O["fields"]>[], Present<O>> {
  assertFields("a repeater", opts.fields, true);
  return make("repeater", opts, withCount(z.array(z.strictObject(objectShape(opts.fields))), opts));
}

function blocks<const O extends BlocksOptions>(
  opts: O,
): Field<BlockData<O["of"][number]>[], Present<O>> {
  const seen = new Set<string>();
  for (const b of opts.of) {
    if (seen.has(b.key)) throw new Error(`Block "${b.key}" is listed twice in a blocks field.`);
    seen.add(b.key);
  }
  const [first, ...rest] = opts.of.map((b) => schemaOf(b) as z.ZodObject);
  if (first === undefined) throw new Error("A blocks field needs at least one block.");
  const item = z.discriminatedUnion("type", [first, ...rest]);
  return make("blocks", opts, withCount(z.array(item), opts));
}

function seo<const O extends CommonOptions<SeoValue> = NoOptions>(
  opts?: O,
): Field<SeoValue, Present<O>> {
  const schema = z.strictObject({
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().min(1).optional(),
    noIndex: z.boolean().optional(),
  });
  return make("seo", opts, schema);
}

/** Built-in field types (FR-2.1). */
export const field = {
  text,
  richText,
  number,
  boolean,
  date,
  datetime,
  select,
  media,
  entry,
  slug,
  json,
  repeater,
  blocks,
  seo,
};
