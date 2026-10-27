import { describe, expect, it } from "vitest";
import { defineContentType } from "./define.js";
import { field } from "./fields.js";
import { validateEntry } from "./validate.js";

const article = defineContentType({
  key: "article",
  fields: {
    title: field.text({ required: true, min: 3, max: 10 }),
    subtitle: field.text(),
    rating: field.number({ min: 1, max: 5 }),
    views: field.number({ default: 0 }),
  },
});

function errorsOf(data: unknown) {
  const result = validateEntry(article, data);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors.map(({ path, code }) => ({ path, code }));
}

describe("validateEntry", () => {
  it("returns cleaned data with defaults applied", () => {
    const input = { title: "Hello" };
    const result = validateEntry(article, input);
    expect(result).toEqual({ ok: true, data: { title: "Hello", views: 0 } });
    expect(input).toEqual({ title: "Hello" });
  });

  it("keeps optional fields that are present", () => {
    const result = validateEntry(article, { title: "Hello", subtitle: "Sub", rating: 3, views: 7 });
    expect(result).toEqual({
      ok: true,
      data: { title: "Hello", subtitle: "Sub", rating: 3, views: 7 },
    });
  });

  it("reports a missing required field as required", () => {
    expect(errorsOf({})).toEqual([{ path: ["title"], code: "required" }]);
  });

  it("reports wrong types, including null", () => {
    expect(errorsOf({ title: 42, subtitle: null })).toEqual([
      { path: ["title"], code: "invalid_type" },
      { path: ["subtitle"], code: "invalid_type" },
    ]);
  });

  it("reports length and range limits", () => {
    expect(errorsOf({ title: "Hi", rating: 9 })).toEqual([
      { path: ["title"], code: "too_small" },
      { path: ["rating"], code: "too_big" },
    ]);
    expect(errorsOf({ title: "Far too long", rating: 0 })).toEqual([
      { path: ["title"], code: "too_big" },
      { path: ["rating"], code: "too_small" },
    ]);
  });

  it("rejects unknown fields, one error per key", () => {
    expect(errorsOf({ title: "Hello", foo: 1, bar: 2 })).toEqual([
      { path: ["foo"], code: "unknown_field" },
      { path: ["bar"], code: "unknown_field" },
    ]);
  });

  it("returns one invalid_type error at the root for non-object input", () => {
    for (const input of [undefined, null, "text", [], 5]) {
      expect(errorsOf(input)).toEqual([{ path: [], code: "invalid_type" }]);
    }
  });

  it("gives every error a message", () => {
    const result = validateEntry(article, { title: 1, foo: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const e of result.errors) expect(e.message).toMatch(/\w/);
    }
  });

  it("returns a fresh copy of default values", () => {
    const tagged = defineContentType({
      key: "tagged",
      fields: { tags: field.json({ default: ["a"] }) },
    });
    const first = validateEntry(tagged, {});
    const second = validateEntry(tagged, {});
    if (!first.ok || !second.ok) throw new Error("expected success");
    (first.data.tags as string[]).push("b");
    expect(second.data.tags).toEqual(["a"]);
  });
});
