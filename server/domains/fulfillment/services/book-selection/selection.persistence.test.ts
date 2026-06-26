import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("selection metadata persistence wiring", () => {
  it("includes an additive shipment_books selection_metadata migration", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0001_add_shipment_books_selection_metadata.sql"),
      "utf8"
    );

    expect(sql).toContain("ALTER TABLE public.shipment_books");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS selection_metadata jsonb NULL");
  });

  it("persists engine metadata when creating shipment books", () => {
    const source = readFileSync(
      resolve(process.cwd(), "server/domains/_legacy/legacy-app-router.ts"),
      "utf8"
    );

    expect(source).toContain("selectionMetadataByCopyId");
    expect(source).toContain("selection_metadata: selectionMetadataByCopyId.get(copy.id) ?? null");
  });
});