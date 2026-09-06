import type { Ack, ClientToServer, ServerToClient, TableState } from "@greed/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * Sitting at a table, whatever is played at it.
 *
 * Everything here is true of any game: opening a table, taking a seat at one,
 * watching one, reclaiming a seat after a refresh, and sending a move. What a
 * move means, and what the state that comes back looks like, is the game's.
 */

type TableSocket = Socket<ServerToClient, ClientToServer>;

/**
 * Everything about a new table except who is opening it. Taken from the
 * protocol rather than restated, so a game that gains an option here cannot
 * gain one this hook silently drops.
 */
export type CreateOptions = Omit<Parameters<ClientToServer["lobby:create"]>[0], "name">;

const SEAT_KEY = "greed.seat";

interface StoredSeat {
  code: string;
  seatId: string;
}

function readSeat(): StoredSeat | null {
  try {
    const raw = window.sessionStorage.getItem(SEAT_KEY);
    return raw === null ? null : (JSON.parse(raw) as StoredSeat);
  } catch {
    return null;
  }
}

function writeSeat(seat: StoredSeat | null): void {
  try {
    if (seat === null) {
      window.sessionStorage.removeItem(SEAT_KEY);
    } else {
      window.sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    }
  } catch {
    // A browser that will not remember is not a reason to refuse to play.
  }
}

export interface TableSocketHook<TView> {
  /** The table as this seat sees it, or null before one is open. */
  state: TView | null;
  seatId: string | null;
  error: string | null;
  connected: boolean;
  busy: boolean;
  create: (name: string, options?: CreateOptions) => void;
  join: (name: string, code: string) => void;
  watch: (code: string) => void;
  leave: () => void;
  /** Sends a move. What is in it is between the caller and the game. */
  act: (action: Record<string, unknown>, done?: () => void) => void;
}

/**
 * @param game Which game's state to accept. One channel carries every game
 * now, and a state from another table rendered through these components would
 * be nonsense at best.
 */
export function useTableSocket<TView>(game: string, onLeave: () => void): TableSocketHook<TView> {
  const socketRef = useRef<TableSocket | null>(null);
  const [state, setState] = useState<TView | null>(null);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // No transports named on purpose: naming one makes it the only one tried,
    // and a browser that cannot open a websocket would simply give up.
    const socket: TableSocket = io("", { withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const stored = readSeat();
      if (stored === null) {
        return;
      }
      socket.emit("lobby:resume", stored, (result: Ack) => {
        if (result.ok) {
          setSeatId(result.seatId);
        } else {
          writeSeat(null);
        }
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (raw: TableState) => {
      if (raw.game !== game) {
        return;
      }
      setState(raw as unknown as TView);
    });
    socket.on("room:error", (message: string) => setError(message));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [game]);

  // Complaints clear themselves rather than stacking up.
  useEffect(() => {
    if (error === null) {
      return;
    }
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const create = useCallback((name: string, options: CreateOptions = {}) => {
    const socket = socketRef.current;
    if (socket === null) {
      return;
    }
    setBusy(true);
    socket.emit("lobby:create", { name, ...options }, (result: Ack) => {
      setBusy(false);
      if (result.ok) {
        setSeatId(result.seatId);
        writeSeat({ code: result.code, seatId: result.seatId });
      } else {
        setError(result.error);
      }
    });
  }, []);

  const join = useCallback((name: string, code: string) => {
    const socket = socketRef.current;
    if (socket === null) {
      return;
    }
    setBusy(true);
    socket.emit("lobby:join", { name, code }, (result: Ack) => {
      setBusy(false);
      if (result.ok) {
        setSeatId(result.seatId);
        writeSeat({ code: result.code, seatId: result.seatId });
      } else {
        setError(result.error);
      }
    });
  }, []);

  const watch = useCallback((code: string) => {
    const socket = socketRef.current;
    if (socket === null) {
      return;
    }
    setBusy(true);
    socket.emit("lobby:watch", { code }, (result: Ack) => {
      setBusy(false);
      if (result.ok) {
        // No seat, so nothing to reclaim on a refresh.
        writeSeat(null);
        setSeatId(null);
      } else {
        setError(result.error);
      }
    });
  }, []);

  const leave = useCallback(() => {
    writeSeat(null);
    socketRef.current?.emit("lobby:leave");
    setState(null);
    setSeatId(null);
    onLeave();
  }, [onLeave]);

  const act = useCallback((action: Record<string, unknown>, done?: () => void) => {
    socketRef.current?.emit("game:action", action as { type: string }, done);
  }, []);

  return { state, seatId, error, connected, busy, create, join, watch, leave, act };
}
