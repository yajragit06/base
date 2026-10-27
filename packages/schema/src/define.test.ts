import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineBlock, defineContentType, type EntryData } from "./define.js";
import { field, type JsonValue, type SeoValue } from "./fields.js";

describe("defineContentType", () => {
  it("keeps the key, label and fields", () => {
    const title = field.text({ required: true, localized: true, admin: { label: "Title" } });
    const page = defineContentType({
      key: "landingPage",
      label: "Landing page",
      fields: { title },
    });
    expect(page.key).toBe("landingPage");
    expect(page.label).toBe("Landing page");
    expect(page.fields.title).toMatchObject({
      kind: "text",
      required: true,
      localized: true,
      admin: { label: "Title" },
    });
  });

  it("rejects keys that are not camelCase", () => {
    for (const key of ["Page", "landing-page", "landing_page", "1page", ""]) {
      expect(() => defineContentType({ key, fields: { title: field.text() } })).toThrow(
        `Invalid content type key "${key}"`,
      );
    }
    expect(() =>
      defineContentType({ key: "page", fields: { "page-title": field.text() } }),
    ).toThrow('Invalid field key "page-title"');
  });

  it("rejects an empty field set", () => {
    expect(() => defineContentType({ key: "page", fields: {} })).toThrow(
      'content type "page" must define at least one field',
    );
  });

  it("rejects a default that fails its own field's validation", () => {
    expect(() =>
      defineContentType({
        key: "page",
        fields: { title: field.text({ max: 3, default: "Too long" }) },
      }),
    ).toThrow('Field "title" in content type "page" has a default that fails its own validation');
    expect(() =>
      defineContentType({ key: "page", fields: { path: field.slug({ default: "Not A Slug" }) } }),
    ).toThrow('Field "path"');
  });

  it("allows localized top-level fields only", () => {
    expect(() => field.repeater({ fields: { label: field.text({ localized: true }) } })).toThrow(
      'Field "label" in a repeater cannot be localized',
    );
    expect(() =>
      defineBlock({ key: "hero", fields: { heading: field.text({ localized: true }) } }),
    ).toThrow('Field "heading" in block "hero" cannot be localized');
  });
});

describe("defineBlock", () => {
  it("rejects bad keys, empty fields and a field named type", () => {
    expect(() => defineBlock({ key: "Hero", fields: { a: field.text() } })).toThrow(
      'Invalid block key "Hero"',
    );
    expect(() => defineBlock({ key: "hero", fields: {} })).toThrow(
      'block "hero" must define at least one field',
    );
    expect(() => defineBlock({ key: "hero", fields: { type: field.text() } })).toThrow(
      'Block "hero" cannot have a field named "type"',
    );
  });

  it("rejects an empty repeater field set", () => {
    expect(() => field.repeater({ fields: {} })).toThrow(
      "a repeater must define at least one field",
    );
  });
});

describe("EntryData", () => {
  const hero = defineBlock({ key: "hero", fields: { heading: field.text({ required: true }) } });
  const quote = defineBlock({ key: "quote", fields: { text: field.text() } });
  const page = defineContentType({
    key: "page",
    fields: {
      title: field.text({ required: true }),
      summary: field.text(),
      body: field.richText(),
      order: field.number({ default: 0 }),
      featured: field.boolean(),
      day: field.date(),
      publishAt: field.datetime(),
      status: field.select({
        required: true,
        options: [
          { value: "draft", label: "Draft" },
          { value: "live", label: "Live" },
        ],
      }),
      tags: field.select({ multiple: true, options: [{ value: "news", label: "News" }] }),
      cover: field.media(),
      parent: field.entry(),
      slug: field.slug({ required: true }),
      extra: field.json(),
      point: field.json({ schema: z.object({ lat: z.number(), lng: z.number() }) }),
      links: field.repeater({
        fields: { label: field.text({ required: true }), url: field.text() },
      }),
      sections: field.blocks({ of: [hero, quote] }),
      seo: field.seo(),
    },
  });

  it("infers required, defaulted and optional fields", () => {
    expectTypeOf<EntryData<typeof page>>().toEqualTypeOf<{
      title: string;
      order: number;
      status: "draft" | "live";
      slug: string;
      summary?: string;
      body?: { [key: string]: JsonValue };
      featured?: boolean;
      day?: string;
      publishAt?: string;
      tags?: "news"[];
      cover?: string;
      parent?: string;
      extra?: JsonValue;
      point?: { lat: number; lng: number };
      links?: { label: string; url?: string }[];
      sections?: ({ type: "hero"; heading: string } | { type: "quote"; text?: string })[];
      seo?: SeoValue;
    }>();
  });
});
