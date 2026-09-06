import type { ChatMessage, ClientToServer, HouseRules, RoomView, ServerToClient } from "@greed/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";

/**
 * Same origin, always. Vite proxies the socket to the game server in
 * development, so the session cookie travels with the handshake and the
 * server knows who is sitting down.
 */
const SERVER_URL = "";

type GameSocket = Socket<ServerToClient, ClientToServer>;

const SEAT_KEY = "greed.seat";

interface StoredSeat {
  code: string;
  seatId: string;
}

/** localStorage can throw outright in a private window; never let it break the page. */
function readSeat(): StoredSeat | null {
  try {
    const raw = window.localStorage.getItem(SEAT_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StoredSeat).code === "string" &&
      typeof (parsed as StoredSeat).seatId === "string"
    ) {
      return parsed as StoredSeat;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeSeat(seat: StoredSeat | null): void {
  try {
    if (seat === null) {
      window.localStorage.removeItem(SEAT_KEY);
    } else {
      window.localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    }
  } catch {
    // ignore
  }
}

export interface RoomActions {
  create: (name: string, ruleset: string) => void;
  join: (name: string, code: string) => void;
  addBot: (skill: "easy" | "normal" | "hard") => void;
  removeSeat: (seatId: string) => void;
  start: () => void;
  roll: () => void;
  toggle: (index: number) => void;
  bank: () => void;
  say: (text: string) => void;
  setRules: (changes: Partial<HouseRules>) => void;
  setBuyIn: (amount: number) => void;
  leave: () => void;
}

export interface RoomHook {
  room: RoomView | null;
  /**
   * Which dice this player has picked up, when that is ahead of the server.
   * Null once the server has caught up and its own answer should be shown.
   */
  heldLocally: boolean[] | null;
  /** A roll has been asked for and the dice it produces have not arrived. */
  rollingLocally: boolean;
  chat: ChatMessage[];
  seatId: string | null;
  error: string | null;
  connected: boolean;
  busy: boolean;
  actions: RoomActions;
}

export function useRoom(): RoomHook {
  const navigate = useNavigate();
  const socketRef = useRef<GameSocket | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  /*
   * What this player has clicked but the server has not answered for yet.
   *
   * Every reply arrives a full round trip after the click that caused it, so a
   * table that waits for one before moving a die feels broken over any real
   * distance. The dice move at once and the server confirms behind them.
   *
   * `pendingToggles` is what makes that safe. While any click is unanswered,
   * incoming state is a picture of the past — adopting it would undo clicks
   * the player has already made and seen. So the local picture stands until
   * the count reaches zero, at which point the server has seen everything and
   * its answer is the better one.
   */
  const [heldLocally, setHeldLocally] = useState<boolean[] | null>(null);
  const pendingToggles = useRef(0);
  /** Set on click, cleared when the roll it belongs to arrives. */
  const [rollingLocally, setRollingLocally] = useState(false);
  /* Read by callbacks that must not be rebuilt on every state broadcast. */
  const roomRef = useRef<RoomView | null>(null);
  roomRef.current = room;

  useEffect(() => {
    // No `transports` list on purpose. Naming one makes it the only one tried:
    // tryAllTransports defaults to false, so a websocket-first client that
    // cannot open a websocket gives up rather than falling back, and plenty of
    // proxies do not pass an upgrade through. Socket.IO's own default opens on
    // polling and upgrades when it can, which degrades instead of failing.
    const socket: GameSocket = io(SERVER_URL, { withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Reclaim the seat this browser was sitting in, if it is still being held.
      const stored = readSeat();
      if (stored === null) {
        return;
      }
      socket.emit("lobby:resume", stored, (result) => {
        if (result.ok) {
          setSeatId(result.seatId);
        } else {
          writeSeat(null);
        }
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (state) => {
      setRoom(state);
      // A roll of our own has landed, so the local stand-in has done its job.
      if (state.turn !== null) {
        setRollingLocally(false);
      }
      if (pendingToggles.current === 0) {
        setHeldLocally(null);
      }
    });
    socket.on("room:error", (message) => setError(message));
    // Kept client-side rather than in room state: the table broadcasts on
    // every roll, and shipping the backlog each time would be waste.
    socket.on("chat:message", (message) => {
      setChat((log) => [...log.slice(-60), message]);
    });
    socket.on("connect_error", () => setError("Cannot reach the server. Is it running?"));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  // Errors clear themselves so the strip does not accumulate stale complaints.
  useEffect(() => {
    if (error === null) {
      return;
    }
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const create = useCallback((name: string, ruleset: string) => {
    const socket = socketRef.current;
    if (socket === null) {
      return;
    }
    setBusy(true);
    socket.emit("lobby:create", { name, ruleset }, (result) => {
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
    socket.emit("lobby:join", { name, code }, (result) => {
      setBusy(false);
      if (result.ok) {
        setSeatId(result.seatId);
        writeSeat({ code: result.code, seatId: result.seatId });
      } else {
        setError(result.error);
      }
    });
  }, []);

  const addBot = useCallback(
    (skill: "easy" | "normal" | "hard") => socketRef.current?.emit("lobby:addBot", { skill }),
    [],
  );
  const removeSeat = useCallback(
    (seatId: string) => socketRef.current?.emit("lobby:removeSeat", { seatId }),
    [],
  );
  const say = useCallback((text: string) => {
    if (text.trim().length > 0) {
      socketRef.current?.emit("chat:send", { text });
    }
  }, []);
  const setRules = useCallback(
    (changes: Partial<HouseRules>) => socketRef.current?.emit("lobby:setRules", changes),
    [],
  );
  const setBuyIn = useCallback(
    (amount: number) => socketRef.current?.emit("lobby:setBuyIn", { amount }),
    [],
  );
  const start = useCallback(() => socketRef.current?.emit("game:start"), []);

  const roll = useCallback(() => {
    const socket = socketRef.current;
    if (socket === null) {
      return;
    }
    // The tumble starts on the press and runs until the dice arrive, so the
    // wait for the server is spent watching dice roll rather than watching
    // nothing happen. What they land on is still the server's to say.
    setRollingLocally(true);
    setHeldLocally(null);
    socket.emit("game:roll");
  }, []);

  const bank = useCallback(() => socketRef.current?.emit("game:bank"), []);

  const toggle = useCallback((index: number) => {
    const socket = socketRef.current;
    if (socket === null) {
      return;
    }
    setHeldLocally((current) => {
      const base = current ?? roomRef.current?.turn?.held ?? null;
      if (base === null) {
        return current;
      }
      const next = [...base];
      next[index] = next[index] !== true;
      return next;
    });
    pendingToggles.current += 1;
    socket.emit("game:toggle", { index }, () => {
      pendingToggles.current -= 1;
      if (pendingToggles.current === 0) {
        // The server has now seen every click; its picture is the true one.
        setHeldLocally(null);
      }
    });
  }, []);

  const leave = useCallback(() => {
    writeSeat(null);
    socketRef.current?.emit("lobby:leave");
    setRoom(null);
    setSeatId(null);
    setChat([]);
    // Clearing the address too, so leaving does not drop the player back on
    // the table's own URL — which reads as an invitation to rejoin it.
    navigate("/");
  }, [navigate]);

  return {
    room,
    heldLocally,
    rollingLocally,
    chat,
    seatId,
    error,
    connected,
    busy,
    actions: {
      create,
      join,
      addBot,
      removeSeat,
      setRules,
      setBuyIn,
      say,
      start,
      roll,
      toggle,
      bank,
      leave,
    },
  };
}
