import { z } from "zod";
import {
  assertFields,
  assertKey,
  type Block,
  type Fields,
  type FieldsData,
  objectShape,
} from "./fields.js";
import { withSchema } from "./internal.js";

export interface ContentType<K extends string = string, F extends Fields = Fields> {
  readonly key: K;
  readonly label?: string;
  readonly fields: F;
}

/** The validated data of one locale of an entry of content type `T`. */
export type EntryData<T extends ContentType> = FieldsData<T["fields"]>;

export function defineContentType<const K extends string, const F extends Fields>(def: {
  key: K;
  label?: string;
  fields: F;
}): ContentType<K, F> {
  assertKey("content type", def.key);
  assertFields(`content type "${def.key}"`, def.fields, false);
  const type: ContentType<K, F> = { key: def.key, label: def.label, fields: def.fields };
  return withSchema(type, z.strictObject(objectShape(def.fields)));
}

export function defineBlock<const K extends string, const F extends Fields>(def: {
  key: K;
  label?: string;
  fields: F;
}): Block<K, F> {
  assertKey("block", def.key);
  if ("type" in def.fields) {
    throw new Error(`Block "${def.key}" cannot have a field named "type": it holds the block key.`);
  }
  assertFields(`block "${def.key}"`, def.fields, true);
  const block: Block<K, F> = { key: def.key, label: def.label, fields: def.fields };
  const schema = z.strictObject({ type: z.literal(def.key), ...objectShape(def.fields) });
  return withSchema(block, schema);
}
