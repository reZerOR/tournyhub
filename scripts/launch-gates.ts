import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  AUTOMATED_GATES,
  BETA_LIMITS,
  betaLimitsSummary,
  evaluateLaunchGates,
  OPERATOR_GATES,
} from "../src/server/operations/launch-gates";

const run = promisify(execFile);

/**
 * Runs the beta launch gates.
 *
 * The automated gates are the repository's own checks, run in order. The
 * operator gates need a production-like environment or a human decision, so
 * each must be attested by name with `--attest <gate id>`; an unattested gate
 * is reported as pending, never assumed.
 *
 * Usage: pnpm launch:gates --attest concurrency --attest capacity ...
 */
const COMMANDS: Record<string, string[]> = {
  browser: ["test:browser"],
  build: ["build"],
  database: ["test:db"],
  env: ["env:check"],
  format: ["format:check"],
  lint: ["lint"],
  typecheck: ["typecheck"],
  unit: ["test:unit"],
};

async function main() {
  const argv = process.argv.slice(2);
  const attestedOperatorGateIds = argv.flatMap((value, index) =>
    value === "--attest" && argv[index + 1] ? [argv[index + 1]!] : [],
  );

  const automated: { id: string; ok: boolean }[] = [];
  for (const gate of AUTOMATED_GATES) {
    const args = COMMANDS[gate.id];
    if (!args) continue;
    process.stdout.write(`\n== ${gate.description} ==\n`);
    try {
      const { stdout } = await run("pnpm", args, {
        cwd: process.cwd(),
        maxBuffer: 32 * 1024 * 1024,
      });
      process.stdout.write(stdout);
      automated.push({ id: gate.id, ok: true });
    } catch (error) {
      const output = error as { stderr?: string; stdout?: string };
      process.stdout.write(output.stdout ?? "");
      process.stderr.write(output.stderr ?? "");
      automated.push({ id: gate.id, ok: false });
    }
  }

  const readiness = evaluateLaunchGates({ automated, attestedOperatorGateIds });

  console.info("\n== Beta limits ==");
  for (const line of betaLimitsSummary()) console.info(`  ${line}`);
  console.info(
    `  (model limits: ${BETA_LIMITS.liveAuctions} live Auction, ${BETA_LIMITS.maxTeams} Teams, ${BETA_LIMITS.maxPlayerEntries} Players, ${BETA_LIMITS.maxConnectedTabs} tabs)`,
  );

  console.info("\n== Automated gates ==");
  for (const gate of automated) {
    console.info(`  ${gate.ok ? "PASS" : "FAIL"}  ${gate.id}`);
  }

  console.info("\n== Operator gates ==");
  for (const gate of OPERATOR_GATES) {
    const status = readiness.pendingOperator.includes(gate.id)
      ? "PENDING"
      : "ATTESTED";
    console.info(`  ${status}  ${gate.id}: ${gate.description}`);
  }

  if (readiness.ready) {
    console.info("\nEvery automated and operator gate is satisfied.");
    return;
  }

  console.error("\nThe beta is not ready to launch:");
  for (const id of readiness.failedAutomated) console.error(`  failed: ${id}`);
  for (const id of readiness.pendingOperator)
    console.error(`  unattested: ${id}`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(
    `Launch gates failed: ${error instanceof Error ? error.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
