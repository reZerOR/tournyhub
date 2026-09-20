import { describe, expect, it } from "vitest";

import {
  AUTOMATED_GATES,
  BETA_LIMITS,
  betaLimitsSummary,
  bidLatencyGate,
  evaluateLaunchGates,
  OPERATOR_GATES,
  percentile95,
} from "@/server/operations/launch-gates";
import { checkVariableNames, WIZARD_STEPS } from "../../scripts/setup-wizard";

describe("percentile95", () => {
  it("uses the nearest rank so the value is one that was observed", () => {
    expect(percentile95([])).toBe(0);
    expect(percentile95([10])).toBe(10);
    expect(percentile95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10);
    expect(
      percentile95(Array.from({ length: 100 }, (_, index) => index + 1)),
    ).toBe(95);
    // The nearest rank never invents a value between samples.
    expect(percentile95([1, 2, 100])).toBe(100);
    expect(percentile95([1, 2, 3, 100])).toBe(100);
  });
});

describe("bidLatencyGate", () => {
  it("passes when the p95 is below the gate and reports the target", () => {
    const fast = bidLatencyGate(
      Array.from({ length: 100 }, (_, index) => 100 + index),
    );
    expect(fast.passesGate).toBe(true);
    expect(fast.passesTarget).toBe(true);

    const slow = bidLatencyGate(
      Array.from({ length: 100 }, (_, index) => 600 + index * 5),
    );
    expect(slow.p95Ms).toBeGreaterThan(750);
    expect(slow.passesGate).toBe(false);
    expect(slow.passesTarget).toBe(false);
  });

  it("does not pass on an empty sample set", () => {
    expect(bidLatencyGate([])).toMatchObject({
      passesGate: false,
      samples: 0,
    });
  });
});

describe("launch gates", () => {
  it("is ready only when every automated gate passes and every operator gate is attested", () => {
    const automated = AUTOMATED_GATES.map((gate) => ({
      id: gate.id,
      ok: true,
    }));
    const allOperator = OPERATOR_GATES.map((gate) => gate.id);

    expect(
      evaluateLaunchGates({ attestedOperatorGateIds: allOperator, automated }),
    ).toMatchObject({ failedAutomated: [], pendingOperator: [], ready: true });

    expect(
      evaluateLaunchGates({ attestedOperatorGateIds: [], automated }),
    ).toMatchObject({
      pendingOperator: allOperator,
      ready: false,
    });

    expect(
      evaluateLaunchGates({
        attestedOperatorGateIds: allOperator,
        automated: automated.map((gate) =>
          gate.id === "typecheck" ? { id: gate.id, ok: false } : gate,
        ),
      }),
    ).toMatchObject({ failedAutomated: ["typecheck"], ready: false });
  });

  it("publishes the beta limits and the no-SLA statement", () => {
    const summary = betaLimitsSummary().join(" ");
    expect(summary).toContain("One Live Auction");
    expect(summary).toContain(`${BETA_LIMITS.recommendedTeams} recommended`);
    expect(summary).toContain(`${BETA_LIMITS.maxTeams} maximum`);
    expect(summary).toContain("40 connected browser tabs");
    expect(summary).toContain("No availability SLA");
  });
});

describe("setup wizard", () => {
  it("reports configured and missing variable names without any value", () => {
    const step = WIZARD_STEPS.find((entry) => entry.id === "gmail-smtp")!;
    const check = checkVariableNames(step, {
      EMAIL_FROM: "TournyHub <no-reply@example.com>",
      SMTP_HOST: "smtp.gmail.com",
    });

    expect(check.present).toEqual(["EMAIL_FROM", "SMTP_HOST"]);
    expect(check.missing).toContain("SMTP_PASSWORD");
    expect(JSON.stringify(check)).not.toContain("no-reply@example.com");
    expect(JSON.stringify(check)).not.toContain("smtp.gmail.com");
  });

  it("covers the provider steps that cannot be automated", () => {
    expect(WIZARD_STEPS.map((step) => step.id)).toEqual([
      "supabase-projects",
      "google-oauth",
      "gmail-smtp",
      "application-secrets",
      "administrator",
    ]);
  });
});
