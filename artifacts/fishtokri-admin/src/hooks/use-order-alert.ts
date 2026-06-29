import { useEffect, useRef } from "react";

/**
 * Plays the order-alert buzzer sound whenever a new order ID appears
 * in the `orders` array that wasn't present in the previous render.
 *
 * Skips playing on the very first load so the sound only fires for
 * orders that arrive while the page is already open (i.e. via polling).
 */
export function useOrderAlert(orders: any[]) {
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create the audio element once
  useEffect(() => {
    const audio = new Audio("/order-alert.wav");
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (orders.length === 0) return;

    const currentIds = new Set(orders.map((o) => String(o._id)));

    if (!initializedRef.current) {
      // First load — seed known IDs without playing
      knownIdsRef.current = currentIds;
      initializedRef.current = true;
      return;
    }

    // Check for any IDs we haven't seen before
    let hasNew = false;
    for (const id of currentIds) {
      if (!knownIdsRef.current.has(id)) {
        hasNew = true;
        break;
      }
    }

    // Merge all current IDs into the known set
    for (const id of currentIds) {
      knownIdsRef.current.add(id);
    }

    if (hasNew && audioRef.current) {
      // Reset and play (handles rapid successive calls gracefully)
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Browser may block autoplay until the user has interacted with the page.
        // This is silently swallowed — no action needed.
      });
    }
  }, [orders]);
}
