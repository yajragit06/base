# Feature: Content type definitions

**From build-plan:** feature 1
**Build attempt:** 1
**Branch:** feature/content-type-definitions

## Goal

Developers define content types in TypeScript with `defineContentType()` and the built-in
field types. One definition gives them inferred TypeScript types for entry data and a
validator that the API will call, which rejects invalid data with field-level errors
[A1, FR-2.1, FR-2.2].

## In scope

- New package `packages/schema` (`@cms/schema`), built and tested like the other packages.
- Field builders under one `field` namespace for every built-in type in FR-2.1: text, rich
  text, number, boolean, date, date/time, select, media, entry reference, repeater, block
  list, JSON, slug and SEO group. Plus `defineBlock()` for block-list members.
- Every field declares validation options, an optional default, a localization flag and
  admin hints (FR-2.2).
- `defineContentType()`, which checks the definition and fails loudly on mistakes.
- `EntryData<typeof myType>`, the inferred TypeScript type of one locale's entry data.
- `validateEntry(type, data)`, returning cleaned data (defaults applied) or a list of
  field-level errors with stable codes and paths.

## Out of scope

- Admin forms rendered from definitions (Feature 7), even though story A1 mentions them.
- Generated TypeScript files and the SDK (Feature 22). Types here come from inference only.
- Storing definitions, entries or the registry snapshot (Features 2, 3 and 5), and any
  HTTP route. Commands in Features 3 and 5 call `validateEntry`.
- A content type registry and lookup by key (added when Feature 2 or 3 needs it).
- Schema versions and migrations (Feature 18), custom field type packages (Feature 17),
  per-locale values and fallback (Feature 19), block rendering (Feature 24).
- Checking that referenced media or entries exist (Features 11 and 3/5, which own them).

## Build loop

Efficient style from `blueprint/config.json` (`stepReview: "feature"`, checkpoint commits
disabled). Build and verify each step in order, then present one feature-level review
packet with the full diff and done-when evidence. `/complete` makes the feature commit
and, with `git.landing: "pull-request"`, offers to push the branch and open a PR.

## Build steps

- [ ] 1. **Package and first vertical slice.** Create `packages/schema` with `zod` (^4.6)
  as its only runtime dependency, `build`/`typecheck`/`test` scripts matching
  `packages/db` and `apps/api`, and Vitest. Implement `defineContentType()`, `field.text()`,
  `field.number()`, `validateEntry()` and the error mapping (see Data / contracts).
  **Done when:** tests prove valid data returns `{ ok: true, data }`, missing required,
  wrong type, too short/long, out of range and unknown keys return the documented codes
  and paths, defaults fill missing values, and `pnpm verify` passes with the new package
  picked up by Turborepo.
- [ ] 2. **Remaining scalar fields.** `field.boolean()`, `field.date()`,
  `field.datetime()`, `field.select()`, `field.slug()`.
  **Done when:** each type has tests for a valid value, a wrong type and its own rule
  (date format, offset required on date/time, option not in list, single and `multiple`
  selects, slug pattern), and `pnpm verify` passes.
- [ ] 3. **Reference and document fields.** `field.media()`, `field.entry()`,
  `field.richText()`, `field.json()` (with an optional caller-supplied Zod schema).
  **Done when:** tests cover valid and invalid values for each, including a custom Zod
  schema on `json` whose failure surfaces as a field-level error at the right path, and
  `pnpm verify` passes.
- [ ] 4. **Composite fields.** `field.repeater()`, `defineBlock()`, `field.blocks()` and
  `field.seo()`.
  **Done when:** tests prove nested errors carry full paths (for example
  `["sections", 1, "title"]`), item count limits on repeaters and block lists, an unknown
  block type returns `unknown_block`, nested defaults apply, and `pnpm verify` passes.
- [ ] 5. **Definition checks and type inference.** `defineContentType()` and
  `defineBlock()` throw on invalid keys, empty field sets, duplicate block keys, a
  default that fails its own field's validation, and `localized` on a nested field.
  Add compile-time type tests (`expectTypeOf`) for `EntryData` across every field type,
  including optional versus required and defaulted fields.
  **Done when:** each definition mistake has a test asserting the thrown message names
  the bad key, type tests pass under `pnpm test` and `pnpm typecheck`, and `pnpm verify`
  passes.

## Files / areas

- `packages/schema/package.json`, `tsconfig.json` (extend `../../tsconfig.base.json`,
  `rootDir: src`, `outDir: dist`, exclude tests, like `packages/db`)
- `packages/schema/src/index.ts` - public exports only
- `packages/schema/src/fields.ts` - field builders and shared options
- `packages/schema/src/define.ts` - `defineContentType`, `defineBlock`, definition checks
- `packages/schema/src/validate.ts` - `validateEntry`, Zod issue to `FieldError` mapping
- `packages/schema/src/*.test.ts` - tests next to the source
- `pnpm-lock.yaml` - updated by `pnpm install`
- `AGENTS.md` Layout section - one line for `packages/schema`

## Data / contracts

Nothing is persisted in this feature. These shapes become stored data in Features 2 and 5,
so they are recorded here and should be confirmed or changed before then.

**Keys.** Content type, block and field keys match `^[a-z][a-zA-Z0-9]*$` (camelCase), so
they are valid JSON keys and TypeScript properties.

**Definition shape.**

```ts
const page = defineContentType({
  key: "page",
  label: "Page",
  fields: {
    title: field.text({ required: true, max: 120, localized: true, admin: { label: "Title" } }),
    slug: field.slug({ required: true }),
    sections: field.blocks({ of: [hero, textBlock], max: 20 }),
  },
});
type PageData = EntryData<typeof page>;
```

**Common field options** (every builder): `required?: boolean` (default `false`),
`default?: <value of the field type>`, `localized?: boolean` (default `false`; top-level
fields only), `admin?: { label?: string; help?: string; group?: string }`. Admin hints are
metadata for Feature 7 and are never used in validation.

**Field types and value shapes** (JSON-safe values only):

| Builder | Value | Type-specific options and rules |
| --- | --- | --- |
| `text` | string | `min`, `max` (length) |
| `richText` | JSON object | Any object for now; see Notes |
| `number` | number (finite) | `min`, `max`, `integer` |
| `boolean` | boolean | - |
| `date` | string `YYYY-MM-DD` | ISO calendar date |
| `datetime` | string, ISO 8601 with offset | Offset required (`Z` or `+hh:mm`) |
| `select` | string, or string[] when `multiple` | `options: { value, label }[]`, `multiple` |
| `media` | string (media id) | Non-empty string |
| `entry` | string (entry id) | Non-empty string |
| `slug` | string | `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `json` | any JSON value | `schema?: ZodType` validates the value |
| `repeater` | object[] | `fields` (nested field set), `min`, `max` (item count) |
| `blocks` | `{ type: string, ...fields }[]` | `of: Block[]`, `min`, `max`; `type` is the block key |
| `seo` | `{ title?, description?, image?, noIndex? }` | text, text, media id, boolean |

Optional fields may be omitted; `null` is not accepted for any field. Unknown keys are
rejected at every level.

**Validation result.**

```ts
type FieldError = { path: (string | number)[]; code: FieldErrorCode; message: string };
type FieldErrorCode =
  | "required" | "invalid_type" | "too_small" | "too_big" | "invalid_format"
  | "invalid_option" | "unknown_field" | "unknown_block" | "invalid";
type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: FieldError[] };
```

- `validateEntry` validates one locale's data object, never throws for bad input
  (including non-object input, which returns one `invalid_type` error with path `[]`),
  and reports every error, not just the first.
- `path` is the full path from the entry root. `unknown_field` points at the unknown key.
- `message` is an English sentence for developers and logs; clients key on `code`.
- `invalid` covers custom Zod refinements and anything without a specific code.
- On success, `data` has defaults applied and is a new object; the input is not mutated.

## Testing

`pnpm test` exists, so every step that adds logic ships passing tests in the same diff.

- Unit tests in `packages/schema/src/*.test.ts` with Vitest, one describe block per field
  type plus definition checks and error mapping.
- Type-level tests with Vitest's `expectTypeOf` for `EntryData`.
- No database, network or browser is involved; no integration or browser tests.
- Final gate: `pnpm verify` (typecheck, lint, test, build).

## Notes for the AI

- Follow `blueprint/context/coding-standards.md`: ESM with `.js` relative imports, strict
  TypeScript with `noUncheckedIndexedAccess`, no `any`, Biome formatting.
- Build field builders on Zod 4 schemas; keep each builder's Zod schema internal and expose
  only the builder API, `EntryData` and `validateEntry`, so the error contract stays ours.
- Map Zod issues explicitly. Check at implement time how Zod 4 reports a missing required
  key, an unrecognised key and an unknown discriminator value, and pin each mapping with
  a test rather than relying on message text.
- Rich text is stored as structured JSON, but the editor (Tiptap or Lexical) is undecided,
  so `richText` accepts any JSON object for now. This is safe only because nothing is
  persisted yet; the document shape must be fixed before Feature 5 stores entries.
- Media and entry ids are only checked as non-empty strings; their format is set by
  Features 2 and 11.
- Do not add a registry, codegen, admin metadata output, persistence or HTTP routes.

## Open questions

None block this feature. Two recorded choices need confirming before Feature 5 persists
entry data:

- Rich text document shape, which depends on the editor choice (Tiptap or Lexical).
- The key pattern (camelCase) and the `seo` group's four fields, which are reasonable
  defaults rather than PRD requirements.
