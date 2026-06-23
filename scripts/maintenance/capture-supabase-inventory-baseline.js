/**
 * Read-only Supabase inventory baseline capture.
 *
 * This script only uses Supabase SELECT/count requests and writes a local,
 * redacted aggregate snapshot under docs/generated/. It never sends a data or
 * schema mutation request.
 */
import "dotenv/config";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

dotenv.config({ path: ".env.local", override: false });

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase credentials. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in the local environment."
  );
}

if (!/^https:\/\//.test(supabaseUrl)) {
  throw new Error("SUPABASE_URL must be an HTTPS URL.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAGE_SIZE = 1_000;
const TABLES = [
  "book_titles",
  "book_copies",
  "book_sorting_tags",
  "bin_floor_config",
  "shipments",
  "shipment_books",
  "shipment_book_swaps",
  "returns",
  "return_books",
  "member_book_history",
  "members",
  "donations",
  "damaged_book_reports",
  "missing_bundle_reports",
];
const ACTIVE_OUTBOUND_SHIPMENT_STATUSES = new Set([
  "picking",
  "packing",
  "packed",
  "shipped",
]);
const ACTIVE_ALLOCATION_SHIPMENT_STATUSES = new Set([
  "picking",
  "packing",
  "packed",
]);
const ACTIVE_RETURN_STATUSES = new Set(["requested", "in_transit", "receiving"]);

function distinctCounts(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const raw = row[field];
    const key = raw === null || raw === undefined || raw === "" ? "__NULL_OR_EMPTY__" : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function duplicateSummary(values) {
  const counts = new Map();
  let nullOrEmpty = 0;
  for (const raw of values) {
    if (raw === null || raw === undefined || raw === "") {
      nullOrEmpty += 1;
      continue;
    }
    const key = String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateCounts = [...counts.values()].filter(count => count > 1);
  return {
    null_or_empty_count: nullOrEmpty,
    duplicate_value_groups: duplicateCounts.length,
    duplicate_rows_beyond_first: duplicateCounts.reduce((sum, count) => sum + count - 1, 0),
  };
}

function normalizeIsbn(value) {
  const normalized = String(value ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  return normalized || null;
}

function groupedCount(rows, keyForRow) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyForRow(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const groups = [...counts.values()].filter(count => count > 1);
  return {
    duplicate_groups: groups.length,
    duplicate_rows_beyond_first: groups.reduce((sum, count) => sum + count - 1, 0),
  };
}

async function safeCount(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  return error ? { count: null, error: error.message } : { count: count ?? 0, error: null };
}

async function safeReadAll(table, columns) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (error) return { data: [], error: error.message };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return { data: rows, error: null };
    from += PAGE_SIZE;
  }
}

function profileLocationCombinations(copies) {
  const combinations = new Map();
  for (const copy of copies) {
    const bin = copy.bin_id ?? "__NULL_BIN__";
    const section = copy.section ?? "__NULL_SECTION__";
    const key = `${bin} | ${section}`;
    combinations.set(key, (combinations.get(key) ?? 0) + 1);
  }
  return {
    distinct_combinations: combinations.size,
    null_bin_count: copies.filter(copy => !copy.bin_id).length,
    null_section_count: copies.filter(copy => !copy.section).length,
  };
}

function markdown(report) {
  const rows = Object.entries(report.table_counts)
    .map(([table, value]) => `| ${table} | ${value.count ?? "unavailable"} | ${value.error ?? ""} |`)
    .join("\n");

  return `# Local Supabase Inventory Baseline Snapshot\n\n` +
    `**Captured at:** ${report.captured_at}\n\n` +
    `**Scope:** read-only aggregate snapshot generated locally. It contains no credentials and no row-level member data.\n\n` +
    `## Access result\n\n` +
    `- Data API reachable: ${report.data_api_reachable ? "yes" : "no"}\n` +
    `- Metadata/RPC definitions captured: no — use the Phase 2D documentation checklist and a separate read-only Dashboard/SQL export.\n\n` +
    `## Table counts\n\n| Table | Count | Read error |\n| --- | ---: | --- |\n${rows}\n\n` +
    `## Profile summary\n\n\`book_copies\` statuses: \`${JSON.stringify(report.profiles.book_copies.status)}\`\n\n` +
    `\`book_copies\` label statuses: \`${JSON.stringify(report.profiles.book_copies.label_status)}\`\n\n` +
    `\`book_copies\` age tiers: \`${JSON.stringify(report.profiles.book_copies.age_group)}\`\n\n` +
    `Duplicate SKU summary: \`${JSON.stringify(report.exceptions.duplicate_skus)}\`\n\n` +
    `Normalized title ISBN summary: \`${JSON.stringify(report.exceptions.title_isbns)}\`\n\n` +
    `Active copy assignment duplicates: \`${JSON.stringify(report.exceptions.duplicate_active_copy_assignments)}\`\n\n` +
    `Duplicate member/title history: \`${JSON.stringify(report.exceptions.duplicate_member_title_history)}\`\n\n` +
    `Overlapping member outbound cycles: \`${JSON.stringify(report.exceptions.overlapping_member_outbound_shipments)}\`\n\n` +
    `Unresolved return records: \`${JSON.stringify(report.exceptions.unresolved_returns)}\`\n`;
}

const tableCountEntries = await Promise.all(
  TABLES.map(async table => [table, await safeCount(table)])
);
const tableCounts = Object.fromEntries(tableCountEntries);
const requiredReads = await Promise.all([
  safeReadAll("book_copies", "id,status,label_status,condition,age_group,bin_id,section,sku,isbn,book_title_id"),
  safeReadAll("book_titles", "id,isbn,age_group,suggested_age_tier"),
  safeReadAll("members", "id,tier,books_per_box"),
  safeReadAll("shipments", "id,member_id,status,shipment_type"),
  safeReadAll("shipment_books", "id,shipment_id,book_copy_id,status"),
  safeReadAll("returns", "id,member_id,original_shipment_id,status"),
  safeReadAll("return_books", "id,return_id,book_copy_id,received,processed_at"),
  safeReadAll("member_book_history", "id,member_id,book_title_id"),
  safeReadAll("donations", "id,status,condition"),
]);

const [copiesRead, titlesRead, membersRead, shipmentsRead, shipmentBooksRead, returnsRead, returnBooksRead, historyRead, donationsRead] = requiredReads;
const readErrors = Object.fromEntries(
  Object.entries({
    book_copies: copiesRead.error,
    book_titles: titlesRead.error,
    members: membersRead.error,
    shipments: shipmentsRead.error,
    shipment_books: shipmentBooksRead.error,
    returns: returnsRead.error,
    return_books: returnBooksRead.error,
    member_book_history: historyRead.error,
    donations: donationsRead.error,
  }).filter(([, error]) => error)
);

const copies = copiesRead.data;
const titles = titlesRead.data;
const members = membersRead.data;
const shipments = shipmentsRead.data;
const shipmentBooks = shipmentBooksRead.data;
const returns = returnsRead.data;
const returnBooks = returnBooksRead.data;
const history = historyRead.data;
const donations = donationsRead.data;
const shipmentStatusById = new Map(shipments.map(shipment => [shipment.id, shipment.status]));
const activeAllocationBooks = shipmentBooks.filter(book =>
  book.book_copy_id && ACTIVE_ALLOCATION_SHIPMENT_STATUSES.has(shipmentStatusById.get(book.shipment_id))
);
const activeReturns = returns.filter(record => ACTIVE_RETURN_STATUSES.has(record.status));
const unresolvedReturnBooks = returnBooks.filter(book => !book.processed_at);
const activeOutboundShipments = shipments.filter(shipment =>
  shipment.shipment_type === "outbound" && ACTIVE_OUTBOUND_SHIPMENT_STATUSES.has(shipment.status)
);

const report = {
  captured_at: new Date().toISOString(),
  snapshot_kind: "local_read_only_aggregate",
  data_api_reachable: Object.keys(readErrors).length === 0,
  table_counts: tableCounts,
  read_errors: readErrors,
  metadata_not_captured: [
    "columns/types/defaults",
    "constraints/indexes",
    "RLS policies/grants",
    "triggers",
    "function and RPC definitions",
    "enum/domain/check definitions",
  ],
  profiles: {
    book_copies: {
      status: distinctCounts(copies, "status"),
      label_status: distinctCounts(copies, "label_status"),
      condition: distinctCounts(copies, "condition"),
      age_group: distinctCounts(copies, "age_group"),
      locations: profileLocationCombinations(copies),
    },
    book_titles: {
      age_group: distinctCounts(titles, "age_group"),
      suggested_age_tier: distinctCounts(titles, "suggested_age_tier"),
    },
    members: {
      tier: distinctCounts(members, "tier"),
      books_per_box: distinctCounts(members, "books_per_box"),
    },
    shipments: { status: distinctCounts(shipments, "status") },
    donations: {
      status: distinctCounts(donations, "status"),
      condition: distinctCounts(donations, "condition"),
    },
  },
  exceptions: {
    duplicate_skus: duplicateSummary(copies.map(copy => copy.sku)),
    title_isbns: duplicateSummary(titles.map(title => normalizeIsbn(title.isbn))),
    copy_isbns: duplicateSummary(copies.map(copy => normalizeIsbn(copy.isbn))),
    duplicate_active_copy_assignments: groupedCount(activeAllocationBooks, book => book.book_copy_id),
    duplicate_member_title_history: groupedCount(history, row =>
      row.member_id && row.book_title_id ? `${row.member_id}:${row.book_title_id}` : null
    ),
    overlapping_member_outbound_shipments: groupedCount(activeOutboundShipments, shipment => shipment.member_id),
    unresolved_returns: {
      active_return_records: activeReturns.length,
      return_books_without_processed_at: unresolvedReturnBooks.length,
    },
  },
};

const outputDirectory = path.resolve("docs/generated");
const timestamp = report.captured_at.replace(/[:.]/g, "-");
const jsonPath = path.join(outputDirectory, `supabase-inventory-baseline-${timestamp}.json`);
const markdownPath = path.join(outputDirectory, `supabase-inventory-baseline-${timestamp}.md`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdownPath, markdown(report), "utf8");

console.log("Read-only Supabase baseline capture completed.");
console.log(`Local JSON snapshot: ${jsonPath}`);
console.log(`Local Markdown snapshot: ${markdownPath}`);
console.log(`Data API reachable: ${report.data_api_reachable ? "yes" : "no"}`);
if (Object.keys(readErrors).length > 0) {
  console.log(`Read errors: ${Object.keys(readErrors).join(", ")}`);
}