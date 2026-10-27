import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineBlock, defineContentType } from "./define.js";
import { type Field, field } from "./fields.js";
import { validateEntry } from "./validate.js";

/** Validates `value` as the only field of a throwaway content type. */
function check(f: Field, value: unknown) {
  const type = defineContentType({ key: "probe", fields: { value: f } });
  const result = validateEntry(type, value === undefined ? {} : { value });
  return result.ok
    ? { ok: true as const, data: result.data.value }
    : { ok: false as const, errors: result.errors.map(({ path, code }) => ({ path, code })) };
}

function code(f: Field, value: unknown) {
  const result = check(f, value);
  return result.ok ? "ok" : result.errors.map((e) => e.code).join(",");
}

describe("boolean", () => {
  it("accepts booleans only", () => {
    expect(code(field.boolean(), true)).toBe("ok");
    expect(code(field.boolean(), "true")).toBe("invalid_type");
  });
});

describe("number", () => {
  it("rejects non-finite and non-integer values when asked", () => {
    expect(code(field.number(), Number.POSITIVE_INFINITY)).toBe("invalid_type");
    expect(code(field.number({ integer: true }), 2)).toBe("ok");
    expect(code(field.number({ integer: true }), 1.5)).toBe("invalid_type");
  });
});

describe("date", () => {
  it("accepts ISO calendar dates", () => {
    expect(code(field.date(), "2026-10-27")).toBe("ok");
    expect(code(field.date(), "27/10/2026")).toBe("invalid_format");
    expect(code(field.date(), "2026-13-01")).toBe("invalid_format");
    expect(code(field.date(), 20261027)).toBe("invalid_type");
  });
});

describe("datetime", () => {
  it("requires an offset", () => {
    expect(code(field.datetime(), "2026-10-27T09:30:00Z")).toBe("ok");
    expect(code(field.datetime(), "2026-10-27T09:30:00+08:00")).toBe("ok");
    expect(code(field.datetime(), "2026-10-27T09:30:00")).toBe("invalid_format");
    expect(code(field.datetime(), "2026-10-27")).toBe("invalid_format");
  });
});

describe("select", () => {
  const options = [
    { value: "draft", label: "Draft" },
    { value: "live", label: "Live" },
  ] as const;

  it("accepts one listed option", () => {
    expect(code(field.select({ options }), "live")).toBe("ok");
    expect(code(field.select({ options }), "gone")).toBe("invalid_option");
    expect(code(field.select({ options }), ["live"])).toBe("invalid_option");
  });

  it("accepts a list of options when multiple", () => {
    const f = field.select({ options, multiple: true });
    expect(check(f, ["draft", "live"])).toEqual({ ok: true, data: ["draft", "live"] });
    expect(check(f, ["draft", "gone"])).toEqual({
      ok: false,
      errors: [{ path: ["value", 1], code: "invalid_option" }],
    });
    expect(code(f, "draft")).toBe("invalid_type");
  });

  it("needs at least one option", () => {
    expect(() => field.select({ options: [] })).toThrow(/at least one option/);
  });
});

describe("slug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(code(field.slug(), "about-us-2")).toBe("ok");
    for (const bad of ["About", "about us", "-about", "about-", "about--us", ""]) {
      expect(code(field.slug(), bad)).toBe("invalid_format");
    }
  });
});

describe("media and entry", () => {
  it("accept non-empty id strings", () => {
    for (const f of [field.media(), field.entry()]) {
      expect(code(f, "abc123")).toBe("ok");
      expect(code(f, "")).toBe("too_small");
      expect(code(f, 7)).toBe("invalid_type");
    }
  });
});

describe("richText", () => {
  it("accepts any JSON object for now", () => {
    expect(code(field.richText(), { type: "doc", content: [{ type: "text" }] })).toBe("ok");
    expect(code(field.richText(), [])).toBe("invalid_type");
    expect(code(field.richText(), "text")).toBe("invalid_type");
  });
});

describe("json", () => {
  it("accepts any JSON value by default", () => {
    expect(code(field.json(), { a: [1, "x", null, true] })).toBe("ok");
    expect(code(field.json(), () => 1)).not.toBe("ok");
  });

  it("validates with a caller-supplied Zod schema and keeps the path", () => {
    const f = field.json({ schema: z.object({ lat: z.number(), lng: z.number() }) });
    expect(check(f, { lat: 1, lng: 2 })).toEqual({ ok: true, data: { lat: 1, lng: 2 } });
    expect(check(f, { lat: 1, lng: "east" })).toEqual({
      ok: false,
      errors: [{ path: ["value", "lng"], code: "invalid_type" }],
    });
  });

  it("maps custom refinements to invalid", () => {
    const f = field.json({ schema: z.number().refine((n) => n % 2 === 0) });
    expect(code(f, 3)).toBe("invalid");
  });
});

describe("seo", () => {
  it("accepts its four optional fields and nothing else", () => {
    expect(code(field.seo(), {})).toBe("ok");
    expect(code(field.seo(), { title: "T", description: "D", image: "m1", noIndex: true })).toBe(
      "ok",
    );
    expect(check(field.seo(), { title: "T", keywords: "x" })).toEqual({
      ok: false,
      errors: [{ path: ["value", "keywords"], code: "unknown_field" }],
    });
  });
});

describe("repeater", () => {
  const links = field.repeater({
    fields: { label: field.text({ required: true }), newTab: field.boolean({ default: false }) },
    min: 1,
    max: 2,
  });

  it("validates each item and applies nested defaults", () => {
    expect(check(links, [{ label: "Home" }])).toEqual({
      ok: true,
      data: [{ label: "Home", newTab: false }],
    });
  });

  it("reports nested errors with full paths", () => {
    expect(check(links, [{ label: "Home" }, { newTab: "yes", extra: 1 }])).toEqual({
      ok: false,
      errors: [
        { path: ["value", 1, "label"], code: "required" },
        { path: ["value", 1, "newTab"], code: "invalid_type" },
        { path: ["value", 1, "extra"], code: "unknown_field" },
      ],
    });
  });

  it("enforces the item count", () => {
    expect(code(links, [])).toBe("too_small");
    expect(code(links, [{ label: "a" }, { label: "b" }, { label: "c" }])).toBe("too_big");
  });
});

describe("blocks", () => {
  const hero = defineBlock({
    key: "hero",
    fields: { heading: field.text({ required: true }), dark: field.boolean({ default: true }) },
  });
  const quote = defineBlock({ key: "quote", fields: { text: field.text({ required: true }) } });
  const sections = field.blocks({ of: [hero, quote], max: 2 });

  it("validates each block by its type and applies nested defaults", () => {
    expect(
      check(sections, [
        { type: "hero", heading: "Hi" },
        { type: "quote", text: "Q" },
      ]),
    ).toEqual({
      ok: true,
      data: [
        { type: "hero", heading: "Hi", dark: true },
        { type: "quote", text: "Q" },
      ],
    });
  });

  it("reports nested errors with full paths", () => {
    expect(
      check(sections, [
        { type: "quote", text: "Q" },
        { type: "hero", heading: 5 },
      ]),
    ).toEqual({
      ok: false,
      errors: [{ path: ["value", 1, "heading"], code: "invalid_type" }],
    });
  });

  it("reports an unknown or missing block type as unknown_block", () => {
    expect(check(sections, [{ type: "video" }, { heading: "Hi" }])).toEqual({
      ok: false,
      errors: [
        { path: ["value", 0, "type"], code: "unknown_block" },
        { path: ["value", 1, "type"], code: "unknown_block" },
      ],
    });
  });

  it("enforces the item count", () => {
    const three = [
      { type: "quote", text: "a" },
      { type: "quote", text: "b" },
      { type: "quote", text: "c" },
    ];
    expect(code(sections, three)).toBe("too_big");
  });

  it("rejects a block listed twice or an empty list", () => {
    expect(() => field.blocks({ of: [hero, hero] })).toThrow(/"hero" is listed twice/);
    expect(() => field.blocks({ of: [] })).toThrow(/at least one block/);
  });
});
