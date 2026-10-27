import {
  appendVersionInTx,
  DbError,
  getLatestVersionInTx,
  getMembershipInTx,
  schema,
} from "@cms/db";
import { validateEntry } from "@cms/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { defineCommand } from "../command.js";
import { CommandError } from "../errors.js";

// Until Feature 18 lets content types declare a version, every schema is version 1.
const SCHEMA_VERSION = 1;

export const saveDraftCommand = defineCommand({
  name: "entry.saveDraft",
  permission: "entry.saveDraft",
  input: z.strictObject({
    siteId: z.uuid(),
    entryId: z.uuid(),
    locale: z.string(),
    baseVersionId: z.uuid().nullable(),
    data: z.unknown(),
  }),
  siteId: (input) => input.siteId,
  handler: async (tx, input, { actor, contentTypes }) => {
    const { entries, sites, versions } = schema;
    // Locking the entry serializes saves on it; the chain constraint is the backstop.
    const [entry] = await tx
      .select({
        typeKey: entries.typeKey,
        createdByType: entries.createdByType,
        createdById: entries.createdById,
      })
      .from(entries)
      .where(and(eq(entries.siteId, input.siteId), eq(entries.id, input.entryId)))
      .for("no key update");
    if (!entry) throw new DbError("entry_not_found", "Entry not found.");

    if (actor.type === "user") {
      const membership = await getMembershipInTx(tx, input.siteId, actor.id);
      const own = entry.createdByType === "user" && entry.createdById === actor.id;
      if (membership?.role === "author" && !own) {
        throw new CommandError("forbidden", "Authors can only edit entries they created.");
      }
    }

    const [site] = await tx
      .select({ locales: sites.locales })
      .from(sites)
      .where(eq(sites.id, input.siteId));
    if (!site) throw new DbError("site_not_found", "Site not found.");
    if (!site.locales.includes(input.locale)) {
      throw new DbError("invalid_locale", `"${input.locale}" is not one of this site's locales.`);
    }

    const type = contentTypes.get(entry.typeKey);
    if (!type) {
      throw new CommandError(
        "unknown_content_type",
        `No content type "${entry.typeKey}" is defined.`,
      );
    }
    const validated = validateEntry(type, input.data);
    if (!validated.ok) {
      throw new CommandError(
        "invalid_input",
        "The input is invalid.",
        validated.errors.map((error) => ({ ...error, path: ["data", ...error.path] })),
      );
    }

    const latest = await getLatestVersionInTx(tx, input.siteId, input.entryId, input.locale);
    if (input.baseVersionId !== (latest?.id ?? null)) {
      if (input.baseVersionId === null) {
        throw new DbError("version_conflict", "Someone saved a newer version first.");
      }
      const [base] = await tx
        .select({ id: versions.id })
        .from(versions)
        .where(
          and(
            eq(versions.siteId, input.siteId),
            eq(versions.entryId, input.entryId),
            eq(versions.locale, input.locale),
            eq(versions.id, input.baseVersionId),
          ),
        );
      throw base
        ? new DbError("version_conflict", "Someone saved a newer version first.")
        : new DbError("version_not_found", "The base version is not a version of this entry.");
    }

    const version = await appendVersionInTx(tx, input.siteId, {
      entryId: input.entryId,
      locale: input.locale,
      data: validated.data,
      schemaVersion: SCHEMA_VERSION,
      actorType: actor.type,
      actorId: actor.id,
      basedOnVersionId: input.baseVersionId,
    });
    return {
      result: version,
      audit: {
        targetType: "entry",
        targetId: input.entryId,
        diff: {
          before: input.baseVersionId === null ? null : { versionId: input.baseVersionId },
          after: { versionId: version.id, locale: version.locale },
        },
      },
    };
  },
});
