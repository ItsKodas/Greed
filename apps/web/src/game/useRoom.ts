import type { ChatMessage, ClientToServer, HouseRules, RoomView, ServerToClient } from "@greed/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";

const SERVER_URL =
  (import.meta.env["VITE_SERVER_URL"] as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

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
  leave: () => void;
}

export interface RoomHook {
  room: RoomView | null;
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

  useEffect(() => {
    const socket: GameSocket = io(SERVER_URL, { transports: ["websocket", "polling"] });
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
    socket.on("room:state", (state) => setRoom(state));
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
  const start = useCallback(() => socketRef.current?.emit("game:start"), []);
  const roll = useCallback(() => socketRef.current?.emit("game:roll"), []);
  const bank = useCallback(() => socketRef.current?.emit("game:bank"), []);
  const toggle = useCallback((index: number) => socketRef.current?.emit("game:toggle", { index }), []);

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
    chat,
    seatId,
    error,
    connected,
    busy,
    actions: { create, join, addBot, removeSeat, setRules, say, start, roll, toggle, bank, leave },
  };
}
