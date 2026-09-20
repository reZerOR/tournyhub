/** One committed shared state change, as distributed to participants. */
export interface RealtimeEvent {
  auctionId: string;
  kind: string;
  payload: Record<string, unknown>;
  revision: number;
}

export type RealtimeSender = (event: RealtimeEvent) => Promise<void> | void;

export interface DistributorOptions {
  /** The minimum gap between participant-wide updates for one Auction. */
  intervalMs?: number;
  now?: () => number;
  schedule?: (flush: () => void, delayMs: number) => void;
  send: RealtimeSender;
}

/**
 * Coalesces participant-wide fan-out to at most two updates per second and
 * always keeps the newest revision. Command acknowledgements are returned
 * directly by the command and never wait behind this batching, so a
 * Representative's own Bid result is immediate.
 */
export class CoalescingRealtimeDistributor {
  private readonly intervalMs: number;
  private readonly lastSentAt = new Map<string, number>();
  private readonly now: () => number;
  private readonly pending = new Map<string, RealtimeEvent>();
  private readonly schedule: (flush: () => void, delayMs: number) => void;
  private readonly scheduled = new Set<string>();
  private readonly send: RealtimeSender;

  constructor(options: DistributorOptions) {
    this.intervalMs = options.intervalMs ?? 500;
    this.now = options.now ?? Date.now;
    this.schedule =
      options.schedule ??
      ((flush, delayMs) => {
        setTimeout(flush, delayMs);
      });
    this.send = options.send;
  }

  publish(event: RealtimeEvent): void {
    const now = this.now();
    const last = this.lastSentAt.get(event.auctionId);
    if (last === undefined || now - last >= this.intervalMs) {
      this.sendNow(event);
      return;
    }

    const existing = this.pending.get(event.auctionId);
    if (!existing || event.revision > existing.revision) {
      this.pending.set(event.auctionId, event);
    }

    if (!this.scheduled.has(event.auctionId)) {
      this.scheduled.add(event.auctionId);
      this.schedule(
        () => this.flush(event.auctionId),
        this.intervalMs - (now - last),
      );
    }
  }

  flush(auctionId: string): void {
    this.scheduled.delete(auctionId);
    const event = this.pending.get(auctionId);
    if (!event) return;
    this.pending.delete(auctionId);
    this.sendNow(event);
  }

  /** The event waiting for its next slot, for diagnostics and tests. */
  pendingFor(auctionId: string): RealtimeEvent | undefined {
    return this.pending.get(auctionId);
  }

  private sendNow(event: RealtimeEvent): void {
    this.lastSentAt.set(event.auctionId, this.now());
    void this.send(event);
  }
}

/** A sender used when no Realtime transport is configured. */
export const discardRealtimeSender: RealtimeSender = () => {};
