/**
 * Read-only PostgREST OpenAPI schema/RPC baseline export.
 *
 * The script makes one GET request to Supabase's /rest/v1/ OpenAPI endpoint
 * and writes local documentation snapshots. It never sends data or schema
 * mutation requests, and it never prints credentials.
 */
import "dotenv/config";
import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

dotenv.config({ path: ".env.local", override: false });

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase credentials. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) locally."
  );
}
if (!/^https:\/\//.test(supabaseUrl)) {
  throw new Error("SUPABASE_URL must be an HTTPS URL.");
}

const response = await fetch(`${supabaseUrl}/rest/v1/`, {
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Accept: "application/openapi+json",
  },
});

if (!response.ok) {
  throw new Error(`OpenAPI metadata request failed: ${response.status} ${response.statusText}`);
}

const openapi = await response.json();
const paths = openapi.paths ?? {};
const definitions = openapi.definitions ?? {};
const rpcEntries = Object.entries(paths)
  .filter(([route]) => route.startsWith("/rpc/"))
  .map(([route, operations]) => {
    const post = operations.post ?? {};
    const bodyParameter = (post.parameters ?? []).find(parameter => parameter.in === "body");
    const properties = bodyParameter?.schema?.properties ?? {};
    return {
      name: route.replace("/rpc/", ""),
      methods: Object.keys(operations),
      required_arguments: bodyParameter?.schema?.required ?? [],
      arguments: Object.fromEntries(
        Object.entries(properties).map(([name, schema]) => [name, {
          type: schema.type ?? null,
          format: schema.format ?? null,
        }])
      ),
      response_description: post.responses?.["200"]?.description ?? null,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const relationEntries = Object.entries(paths)
  .filter(([route]) => !route.startsWith("/rpc/") && /^\/[a-zA-Z0-9_]+$/.test(route))
  .map(([route, operations]) => {
    const name = route.slice(1);
    const definition = definitions[name] ?? {};
    const properties = definition.properties ?? {};
    return {
      name,
      methods: Object.keys(operations),
      required_fields: definition.required ?? [],
      fields: Object.fromEntries(
        Object.entries(properties).map(([field, schema]) => [field, {
          type: schema.type ?? null,
          format: schema.format ?? null,
          nullable: schema.nullable ?? null,
          default: schema.default ?? null,
        }])
      ),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const targetRelationNames = [
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
];
const targetRelations = Object.fromEntries(
  targetRelationNames.map(name => [
    name,
    relationEntries.find(relation => relation.name === name) ?? null,
  ])
);
const targetRpcs = Object.fromEntries(
  ["get_shipment_pick_list", "select_books_for_shipment"].map(name => [
    name,
    rpcEntries.find(rpc => rpc.name === name) ?? null,
  ])
);

const capturedAt = new Date().toISOString();
const summary = {
  captured_at: capturedAt,
  snapshot_kind: "local_read_only_postgrest_openapi_metadata",
  openapi: {
    title: openapi.info?.title ?? null,
    version: openapi.info?.version ?? null,
    path_count: Object.keys(paths).length,
    relation_count: relationEntries.length,
    rpc_count: rpcEntries.length,
  },
  target_relations: targetRelations,
  target_rpcs: targetRpcs,
  relation_names: relationEntries.map(relation => relation.name),
  rpc_names: rpcEntries.map(rpc => rpc.name),
  donations_path_visible: Boolean(paths["/donations"]),
  not_available_from_openapi: [
    "PostgreSQL constraints and indexes",
    "RLS policies and grants",
    "triggers and trigger functions",
    "function source definitions and security mode",
    "enum, domain, and check-constraint definitions",
    "materialized-view metadata",
    "relation ownership and database roles",
  ],
};

function markdown(report) {
  const relationRows = Object.entries(report.target_relations)
    .map(([name, relation]) => `| ${name} | ${relation ? relation.methods.join(", ") : "not visible"} | ${relation ? Object.keys(relation.fields).length : 0} |`)
    .join("\n");
  const rpcRows = Object.entries(report.target_rpcs)
    .map(([name, rpc]) => `| ${name} | ${rpc ? JSON.stringify(rpc.required_arguments) : "not visible"} | ${rpc ? JSON.stringify(rpc.arguments) : ""} |`)
    .join("\n");

  return `# Local Supabase OpenAPI Schema/RPC Snapshot\n\n` +
    `**Captured at:** ${report.captured_at}\n\n` +
    `**Scope:** read-only PostgREST OpenAPI metadata. This is not a complete PostgreSQL schema dump and contains no credentials.\n\n` +
    `## Coverage\n\n` +
    `- OpenAPI paths: ${report.openapi.path_count}\n` +
    `- Visible relation paths: ${report.openapi.relation_count}\n` +
    `- Visible RPC paths: ${report.openapi.rpc_count}\n` +
    `- Donations path visible: ${report.donations_path_visible ? "yes" : "no"}\n\n` +
    `## Target relations\n\n| Relation | HTTP methods | Fields visible |\n| --- | --- | ---: |\n${relationRows}\n\n` +
    `## Target RPC signatures\n\n| RPC | Required arguments | Arguments |\n| --- | --- | --- |\n${rpcRows}\n\n` +
    `## Not available from this source\n\n${report.not_available_from_openapi.map(item => `- ${item}`).join("\n")}\n`;
}

const outputDirectory = path.resolve("docs/generated");
const timestamp = capturedAt.replace(/[:.]/g, "-");
const rawPath = path.join(outputDirectory, `supabase-openapi-${timestamp}.json`);
const summaryPath = path.join(outputDirectory, `supabase-schema-rpc-baseline-${timestamp}.json`);
const markdownPath = path.join(outputDirectory, `supabase-schema-rpc-baseline-${timestamp}.md`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(rawPath, `${JSON.stringify(openapi, null, 2)}\n`, "utf8");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await writeFile(markdownPath, markdown(summary), "utf8");

console.log("Read-only Supabase OpenAPI schema/RPC export completed.");
console.log(`Local raw OpenAPI snapshot: ${rawPath}`);
console.log(`Local summary JSON: ${summaryPath}`);
console.log(`Local summary Markdown: ${markdownPath}`);
console.log(`Visible relation paths: ${summary.openapi.relation_count}`);
console.log(`Visible RPC paths: ${summary.openapi.rpc_count}`);
console.log(`Donations path visible: ${summary.donations_path_visible ? "yes" : "no"}`);