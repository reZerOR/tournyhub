/**
 * The beta launch gates.
 *
 * The beta may launch only when every gate passes. The automated gates are the
 * repository's own checks; the operator gates are the ones that need a
 * production-like environment, real provider accounts, or a human decision, and
 * each must be attested by name rather than assumed.
 */

export const BID_LATENCY_TARGET_MS = 500;
export const BID_LATENCY_GATE_MS = 750;
export const BID_LATENCY_TABS = 40;

/** The accepted capacity model for the free-tier beta. */
export const BETA_LIMITS = {
  liveAuctions: 1,
  maxConnectedTabs: 40,
  maxPlayerEntries: 2_000,
  maxTeams: 32,
  /** The model limit, as opposed to the recommendation. */
  recommendedTeams: 16,
} as const;

/** What the beta must tell its operator, and what it does not promise. */
export function betaLimitsSummary(): string[] {
  return [
    `One Live Auction at a time (model limit ${BETA_LIMITS.liveAuctions}).`,
    `Teams: ${BETA_LIMITS.recommendedTeams} recommended, ${BETA_LIMITS.maxTeams} maximum.`,
    `At most ${BETA_LIMITS.maxPlayerEntries.toLocaleString()} Player Entries per Auction.`,
    `At most ${BETA_LIMITS.maxConnectedTabs} connected browser tabs.`,
    "A personal, non-commercial beta on free provider plans.",
    "No availability SLA and no guaranteed response time.",
  ];
}

/**
 * The nearest-rank 95th percentile. It is used for the Bid latency gate, so it
 * must be deterministic: an interpolated value can report a number no client
 * observed.
 */
export function percentile95(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

export interface BidLatencyResult {
  gateMs: number;
  p95Ms: number;
  passesGate: boolean;
  passesTarget: boolean;
  samples: number;
  targetMs: number;
}

/** Evaluates the measured Bid response latencies against the accepted gate. */
export function bidLatencyGate(latencies: readonly number[]): BidLatencyResult {
  const p95Ms = percentile95(latencies);
  return {
    gateMs: BID_LATENCY_GATE_MS,
    p95Ms,
    passesGate: latencies.length > 0 && p95Ms < BID_LATENCY_GATE_MS,
    passesTarget: latencies.length > 0 && p95Ms < BID_LATENCY_TARGET_MS,
    samples: latencies.length,
    targetMs: BID_LATENCY_TARGET_MS,
  };
}

export type GateKind = "automated" | "operator";

export interface LaunchGate {
  description: string;
  id: string;
  kind: GateKind;
}

/** The automated gates, in the order they should run. */
export const AUTOMATED_GATES: LaunchGate[] = [
  { description: "Formatting", id: "format", kind: "automated" },
  { description: "Linting", id: "lint", kind: "automated" },
  { description: "Static types", id: "typecheck", kind: "automated" },
  { description: "Environment configuration", id: "env", kind: "automated" },
  { description: "Unit and property tests", id: "unit", kind: "automated" },
  {
    description: "Database integration tests",
    id: "database",
    kind: "automated",
  },
  { description: "Production build", id: "build", kind: "automated" },
  { description: "Browser tests", id: "browser", kind: "automated" },
];

/** The gates that need a production-like environment or a human decision. */
export const OPERATOR_GATES: LaunchGate[] = [
  {
    description:
      "Concurrency scenarios pass repeatedly: equal-price Bids, Bid versus finalizer, duplicate finalizers, pause versus Bid, representative replacement, response-loss retry, revision gaps, and competing corrections.",
    id: "concurrency",
    kind: "operator",
  },
  {
    description:
      "A production-like 40-tab rehearsal reports a Bid p95 below 750 ms with a target below 500 ms, and stays inside the documented quota and lock-wait limits.",
    id: "capacity",
    kind: "operator",
  },
  {
    description:
      "The current and previous major versions of Chrome, Edge, Firefox, and Safari pass the essential Organizer and representative flows.",
    id: "browsers",
    kind: "operator",
  },
  {
    description:
      "Privacy checks find no phone number in a PDF, a participant-wide Realtime message, an unauthorized snapshot, feedback, a URL, or a platform log.",
    id: "privacy",
    kind: "operator",
  },
  {
    description:
      "Production secrets differ from development and Preview, are absent from source and client bundles, and pass a rotation check.",
    id: "secrets",
    kind: "operator",
  },
  {
    description:
      "A backup restores into a separate environment, and the operator completes the first-event checklist and a practice Auction.",
    id: "recovery",
    kind: "operator",
  },
  {
    description:
      "No unresolved critical or high-severity integrity, authorization, privacy, or data-loss defect remains.",
    id: "defects",
    kind: "operator",
  },
];

export interface GateOutcome {
  id: string;
  status: "failed" | "passed" | "pending";
}

export interface LaunchReadiness {
  failedAutomated: string[];
  pendingOperator: string[];
  ready: boolean;
}

/**
 * Combines the automated results with the operator attestations. A missing
 * attestation is `pending`, never `passed`, so the report cannot claim a gate
 * the operator has not confirmed.
 */
export function evaluateLaunchGates({
  automated,
  attestedOperatorGateIds,
}: {
  automated: readonly { id: string; ok: boolean }[];
  attestedOperatorGateIds: readonly string[];
}): LaunchReadiness {
  const failedAutomated = automated
    .filter((gate) => !gate.ok)
    .map((gate) => gate.id);
  const attested = new Set(attestedOperatorGateIds);
  const pendingOperator = OPERATOR_GATES.filter(
    (gate) => !attested.has(gate.id),
  ).map((gate) => gate.id);

  return {
    failedAutomated,
    pendingOperator,
    ready: failedAutomated.length === 0 && pendingOperator.length === 0,
  };
}
