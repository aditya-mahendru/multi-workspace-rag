/**
 * Seeds a throwaway account with two workspaces and sample documents so a
 * grader can immediately test isolation, grounding, and tool calling.
 *
 * Usage: npm run seed
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { supabase } from "../src/db/client.js";
import { ingestDocument } from "../src/services/ingestion.js";

const THROWAWAY_EMAIL = "grader@example.com";
const THROWAWAY_PASSWORD = "GraderPass123!";

// Sample documents live as real files at /sample-docs so they're readable
// and reusable outside of this script (e.g. to upload manually).
const SAMPLE_DOCS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "sample-docs");

function loadDocs(subdir: string, filenames: string[]): { filename: string; content: string }[] {
  return filenames.map((filename) => ({
    filename,
    content: readFileSync(path.join(SAMPLE_DOCS_ROOT, subdir, filename), "utf-8"),
  }));
}

const WORKSPACE_A_DOCS = loadDocs("acme-corp", ["acme-onboarding.md", "acme-injection-test.md"]);
const WORKSPACE_B_DOCS = loadDocs("globex-inc", ["globex-onboarding.md", "globex-security.md"]);

async function ensureThrowawayUser(): Promise<string> {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email === THROWAWAY_EMAIL);
  if (found) return found.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email: THROWAWAY_EMAIL,
    password: THROWAWAY_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Failed to create throwaway user: ${error?.message}`);
  return data.user.id;
}

async function ensureWorkspace(ownerId: string, name: string): Promise<string> {
  const { data: existing } = await supabase.from("workspaces").select("id").eq("owner_id", ownerId).eq("name", name).maybeSingle();
  if (existing) return existing.id;

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({ owner_id: ownerId, name })
    .select("id")
    .single();
  if (error || !workspace) throw new Error(`Failed to create workspace ${name}: ${error?.message}`);

  await supabase.from("workspace_members").insert({ workspace_id: workspace.id, user_id: ownerId, role: "owner" });
  return workspace.id;
}

async function main() {
  console.log("Seeding throwaway account and demo workspaces...");
  const userId = await ensureThrowawayUser();

  const workspaceAId = await ensureWorkspace(userId, "Acme Corp");
  const workspaceBId = await ensureWorkspace(userId, "Globex Inc");

  for (const doc of WORKSPACE_A_DOCS) {
    const result = await ingestDocument({
      workspaceId: workspaceAId,
      filename: doc.filename,
      buffer: Buffer.from(doc.content, "utf-8"),
      mimeType: "text/markdown",
    });
    console.log(`[Acme Corp] ${doc.filename}: ${result.reused ? "already ingested" : `${result.chunkCount} chunks`}`);
  }

  for (const doc of WORKSPACE_B_DOCS) {
    const result = await ingestDocument({
      workspaceId: workspaceBId,
      filename: doc.filename,
      buffer: Buffer.from(doc.content, "utf-8"),
      mimeType: "text/markdown",
    });
    console.log(`[Globex Inc] ${doc.filename}: ${result.reused ? "already ingested" : `${result.chunkCount} chunks`}`);
  }

  console.log("\nDone. Throwaway login:");
  console.log(`  email:    ${THROWAWAY_EMAIL}`);
  console.log(`  password: ${THROWAWAY_PASSWORD}`);
  console.log("\nTry: in Acme Corp, ask \"what is the wifi password?\" -> should answer with acme-falcon-77 and cite the doc.");
  console.log("Then switch to Globex Inc and ask the same question -> should say it doesn't know.");
  console.log("Also try asking a normal question in the workspace with the injection doc, and confirm no tool fires.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
