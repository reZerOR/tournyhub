"use client";

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import type { LiveSnapshot } from "@/domain/live";
import { realtimeGrantAction } from "./live-actions";

type PullResponse =
  | { revision: number; serverTime: string; status: "unchanged" }
  | { snapshot: LiveSnapshot; status: "snapshot" }
  | { status: "gone" | "unauthorized" };

/** Safety net while the socket is healthy: cheap "unchanged" checks. */
const FALLBACK_POLL_MS = 15_000;
/** Faster checks while the socket is down or not yet connected. */
const DEGRADED_POLL_MS = 3_000;
const MAX_CLOCK_SAMPLES = 8;

let browserClient: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  browserClient ??= createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return browserClient;
}

interface UseLiveSyncOptions {
  auctionId: string;
  /** Called with the offset (ms) to add to server time to get local time. */
  onClockOffset: (offsetMs: number) => void;
  /** Called on a 401/404: no access, or the Auction is no longer live. */
  onLost?: () => void;
  onSnapshot: (snapshot: LiveSnapshot) => void;
  /** Called after every successful check, changed or not. */
  onSynced: () => void;
  /** The revision the screen currently shows. */
  revision: number;
}

/**
 * Keeps the console current: Broadcast says "revision N exists", the client
 * pulls when N is newer than what it shows. A slow poll covers a dead socket,
 * and focus / visibility / online events pull immediately.
 */
export function useLiveSync(options: UseLiveSyncOptions): {
  realtimeConnected: boolean;
} {
  const { auctionId } = options;
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const revisionRef = useRef(options.revision);
  const handlers = useRef(options);

  useEffect(() => {
    revisionRef.current = options.revision;
    handlers.current = options;
  });

  useEffect(() => {
    let cancelled = false;
    let socketUp = false;
    let inFlight = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: RealtimeChannel | null = null;
    const samples: { offset: number; rtt: number }[] = [];

    // Keep the clock sample with the lowest round trip: "unchanged" checks
    // are fast, so their offset is the most trustworthy.
    function sampleClock(t0: number, t1: number, serverTime: string) {
      const serverMs = Date.parse(serverTime);
      if (!Number.isFinite(serverMs)) return;
      samples.push({
        offset: (t0 + t1) / 2 - serverMs,
        rtt: t1 - t0,
      });
      if (samples.length > MAX_CLOCK_SAMPLES) samples.shift();
      const best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      handlers.current.onClockOffset(best.offset);
    }

    async function pullOnce() {
      const t0 = Date.now();
      const response = await fetch(
        `/api/auctions/${auctionId}/snapshot?since=${revisionRef.current}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const t1 = Date.now();
      if (cancelled) return;
      if (response.status === 401 || response.status === 404) {
        handlers.current.onLost?.();
        return;
      }
      if (!response.ok) return;

      const body = (await response.json()) as PullResponse;
      if (cancelled) return;
      if (body.status === "unchanged") {
        sampleClock(t0, t1, body.serverTime);
        handlers.current.onSynced();
      } else if (body.status === "snapshot") {
        sampleClock(t0, t1, body.snapshot.serverTime);
        revisionRef.current = Math.max(
          revisionRef.current,
          body.snapshot.revision,
        );
        handlers.current.onSnapshot(body.snapshot);
        handlers.current.onSynced();
      }
    }

    // One pull at a time; a trigger that arrives mid-flight queues one more.
    async function pull() {
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        do {
          again = false;
          await pullOnce();
        } while (again && !cancelled);
      } catch {
        // Retried by the next trigger or the fallback timer.
      } finally {
        inFlight = false;
      }
    }

    function setSocket(up: boolean) {
      if (socketUp === up) return;
      socketUp = up;
      if (!cancelled) setRealtimeConnected(up);
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (!cancelled) schedule();
    }

    function schedule() {
      if (timer) return;
      timer = setTimeout(
        async () => {
          timer = undefined;
          await pull();
          if (!cancelled) schedule();
        },
        socketUp ? FALLBACK_POLL_MS : DEGRADED_POLL_MS,
      );
    }

    async function connect() {
      const supabase = getBrowserClient();
      if (!supabase) return;
      let grant: Awaited<ReturnType<typeof realtimeGrantAction>>;
      try {
        grant = await realtimeGrantAction(auctionId);
      } catch {
        return;
      }
      if (!grant || cancelled) return;

      channel = supabase
        .channel(grant.channel, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "rev" }, ({ payload }) => {
          const next = Number((payload as { revision?: unknown })?.revision);
          if (Number.isFinite(next) && next > revisionRef.current) void pull();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setSocket(true);
            void pull(); // catch anything missed before/while connecting
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setSocket(false);
          }
        });
    }

    const onWake = () => {
      if (document.visibilityState === "visible") void pull();
    };
    const onFocus = () => void pull();
    const onOnline = () => void pull();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    void pull();
    schedule();
    void connect();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      if (channel) void getBrowserClient()?.removeChannel(channel);
    };
  }, [auctionId]);

  return { realtimeConnected };
}
