// Gives each Netlify Deploy Preview and branch deploy its own Neon branch,
// forked from `production` so they have real data. Neon branches are
// copy-on-write: migrations and writes on them never touch production.
//
// Usage:
//   build:  dotenvx run -f .env.dev -- node scripts/neon-preview-branch.js build
//           (netlify.toml's deploy-preview and branch-deploy commands, via
//           `npm run build:preview`). Creates or reuses the Neon branch,
//           migrates it, then runs `nuxt build` with its DATABASE_URL baked in.
//   delete: dotenvx run -f .env.e2e -- node scripts/neon-preview-branch.js delete
//           (.github/workflows/neon-preview-cleanup.yml, when the PR closes or
//           the git branch is deleted)
//
// Reads NEON_API_KEY and NEON_PROJECT_ID from the decrypted env file. The Neon
// branch name comes from Netlify's CONTEXT plus REVIEW_ID (the PR number) or
// BRANCH (the git branch); the cleanup workflow sets the same variables from
// its GitHub event.

import { execFileSync } from "node:child_process";
import { createNeonClient } from "./neon-api.js";
import { runIfDirectInvocation } from "./run-if-direct.js";

export const PREVIEW_PARENT_BRANCH_NAME = "production";
const ENCRYPTED_VALUE_PREFIX = "encrypted:";

const BRANCH_NAME_BY_CONTEXT = {
  "deploy-preview": (env) => `preview/pr-${requireEnv(env, "REVIEW_ID")}`,
  "branch-deploy": (env) => `branch/${requireEnv(env, "BRANCH")}`,
};

export function previewBranchName(env) {
  const branchNameFor = BRANCH_NAME_BY_CONTEXT[env.CONTEXT];
  if (!branchNameFor) {
    throw new Error(
      `CONTEXT must be one of ${Object.keys(BRANCH_NAME_BY_CONTEXT).join(", ")}; got "${env.CONTEXT ?? ""}"`,
    );
  }
  return branchNameFor(env);
}

// Every branch in the project shares one database and role name, so reuse the
// names from .env.dev's DATABASE_URL.
export function databaseAndRoleFrom(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    databaseName: decodeURIComponent(url.pathname.slice(1)),
    roleName: decodeURIComponent(url.username),
  };
}

async function findOrCreatePreviewBranch(client, name) {
  const existing = await client.findBranchByName(name);
  if (existing) {
    return existing;
  }
  const parent = await client.findBranchByName(PREVIEW_PARENT_BRANCH_NAME);
  if (!parent) {
    throw new Error(
      `Neon parent branch "${PREVIEW_PARENT_BRANCH_NAME}" not found; previews fork from it.`,
    );
  }
  return client.createBranch({ name, parentId: parent.id });
}

// The build migrates whatever branch this resolves to, and the parent is
// production, so refuse the project's default branch outright.
function assertNotDefaultBranch(branch) {
  if (branch.default) {
    throw new Error(
      `Refusing to use Neon's default branch "${branch.name}" for a preview.`,
    );
  }
}

export async function previewDatabaseUrl(
  client,
  branchName,
  templateDatabaseUrl,
) {
  const branch = await findOrCreatePreviewBranch(client, branchName);
  assertNotDefaultBranch(branch);
  return client.getPooledConnectionUri({
    branchId: branch.id,
    ...databaseAndRoleFrom(templateDatabaseUrl),
  });
}

// Returns whether a branch was deleted; a PR or git branch that never got a
// Netlify build has none, which is fine.
export async function deletePreviewBranch(client, branchName) {
  const branch = await client.findBranchByName(branchName);
  if (!branch) {
    return false;
  }
  assertNotDefaultBranch(branch);
  await client.deleteBranch(branch.id);
  return true;
}

// dotenvx passes raw ciphertext through when the private key is missing or
// wrong, which would otherwise surface as a confusing Neon 401.
export function requireEnv(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  if (value.startsWith(ENCRYPTED_VALUE_PREFIX)) {
    throw new Error(
      `${name} is still encrypted; is the dotenvx private key set for this context?`,
    );
  }
  return value;
}

function runWithDatabaseUrl(command, args, databaseUrl) {
  execFileSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function build(client, branchName) {
  const databaseUrl = await previewDatabaseUrl(
    client,
    branchName,
    requireEnv(process.env, "DATABASE_URL"),
  );
  console.log(`Using Neon branch ${branchName}`);
  runWithDatabaseUrl("npx", ["drizzle-kit", "migrate"], databaseUrl);
  runWithDatabaseUrl("npx", ["nuxt", "build"], databaseUrl);
}

async function remove(client, branchName) {
  const deleted = await deletePreviewBranch(client, branchName);
  console.log(
    deleted
      ? `Deleted Neon branch ${branchName}`
      : `No Neon branch ${branchName}`,
  );
}

const COMMANDS = { build, delete: remove };

async function main() {
  const command = COMMANDS[process.argv[2]];
  if (!command) {
    throw new Error(
      "Usage: node scripts/neon-preview-branch.js <build|delete>",
    );
  }
  const client = createNeonClient({
    apiKey: requireEnv(process.env, "NEON_API_KEY"),
    projectId: requireEnv(process.env, "NEON_PROJECT_ID"),
  });
  await command(client, previewBranchName(process.env));
}

runIfDirectInvocation(import.meta.url, main, "neon-preview-branch");
