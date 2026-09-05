import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { Server } from "socket.io";
import type { Die } from "@greed/rules";
import { DEFAULT_RULESET, RULESETS } from "@greed/rules";
import { CODE_ALPHABET, CODE_LENGTH } from "@greed/shared";
import type { ClientToServer, ServerToClient } from "@greed/shared";
import { Room, RoomError } from "./room.js";

/**
 * Port precedence: an explicit --port flag, then PORT, then 3001. The flag
 * matters in dev because the harness that launches both processes sets PORT
 * for the web server, and the API must not inherit it.
 */
const portFlag = process.argv.indexOf("--port");
const PORT = Number(
  portFlag !== -1 ? process.argv[portFlag + 1] : (process.env["PORT"] ?? 3001),
);
const CLIENT_ORIGIN = process.env["CLIENT_ORIGIN"] ?? "http://localhost:5173";

/** How long the busting dice stay on screen before play moves on. */
const FARKLE_PAUSE_MS = 2200;
/** Rooms with nobody connected are reaped after this long. */
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

const rooms = new Map<string, Room>();
/** socket.id -> which room and seat it is sitting in. */
const sockets = new Map<string, { code: string; seatId: string }>();

/** The dice. Server-side, always — a client never generates a face. */
function rollDice(count: number): Die[] {
  const dice: Die[] = [];
  for (let index = 0; index < count; index += 1) {
    dice.push(randomInt(1, 7) as Die);
  }
  return dice;
}

function makeCode(): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = "";
    for (let index = 0; index < CODE_LENGTH; index += 1) {
      code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  throw new Error("could not find a free room code");
}

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

app.get("/healthz", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size });
});

// In production the built client is served from the same origin.
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = join(here, "../../web/dist");
app.use(express.static(clientDist));

function broadcast(code: string): void {
  const room = rooms.get(code);
  if (room !== undefined) {
    io.to(code).emit("room:state", room.view());
  }
}

/** Wraps a handler so RoomError becomes a message instead of a crash. */
function guard(socketId: string, run: (room: Room, seatId: string) => void): void {
  const seat = sockets.get(socketId);
  const socket = io.sockets.sockets.get(socketId);
  if (seat === undefined || socket === undefined) {
    return;
  }
  const room = rooms.get(seat.code);
  if (room === undefined) {
    socket.emit("room:error", "That table is gone.");
    return;
  }
  try {
    run(room, seat.seatId);
    broadcast(seat.code);
  } catch (error) {
    if (error instanceof RoomError) {
      socket.emit("room:error", error.message);
      return;
    }
    console.error("unexpected error handling an action", error);
    socket.emit("room:error", "Something went wrong.");
  }
}

io.on("connection", (socket) => {
  socket.on("lobby:create", ({ name, ruleset }, ack) => {
    try {
      const chosen = RULESETS.find((candidate) => candidate.name === ruleset) ?? DEFAULT_RULESET;
      const code = makeCode();
      const room = new Room(code, rollDice, chosen);
      rooms.set(code, room);
      room.join(socket.id, name);
      sockets.set(socket.id, { code, seatId: socket.id });
      void socket.join(code);
      ack({ ok: true, code, seatId: socket.id });
      broadcast(code);
    } catch (error) {
      ack({ ok: false, error: error instanceof RoomError ? error.message : "Could not open a table." });
    }
  });

  socket.on("lobby:join", ({ name, code }, ack) => {
    const normalized = String(code ?? "").trim().toUpperCase();
    const room = rooms.get(normalized);
    if (room === undefined) {
      ack({ ok: false, error: "No table with that code." });
      return;
    }
    try {
      room.join(socket.id, name);
      sockets.set(socket.id, { code: normalized, seatId: socket.id });
      void socket.join(normalized);
      ack({ ok: true, code: normalized, seatId: socket.id });
      broadcast(normalized);
    } catch (error) {
      ack({ ok: false, error: error instanceof RoomError ? error.message : "Could not sit down." });
    }
  });

  socket.on("lobby:resume", ({ seatId, code }, ack) => {
    const room = rooms.get(String(code ?? "").trim().toUpperCase());
    if (room === undefined) {
      ack({ ok: false, error: "That table is gone." });
      return;
    }
    try {
      room.reconnect(seatId);
      sockets.set(socket.id, { code: room.code, seatId });
      void socket.join(room.code);
      ack({ ok: true, code: room.code, seatId });
      broadcast(room.code);
    } catch (error) {
      ack({ ok: false, error: error instanceof RoomError ? error.message : "Could not rejoin." });
    }
  });

  socket.on("game:start", () => {
    guard(socket.id, (room, seatId) => room.start(seatId));
  });

  socket.on("game:toggle", ({ index }) => {
    guard(socket.id, (room, seatId) => room.toggle(seatId, index));
  });

  socket.on("game:bank", () => {
    guard(socket.id, (room, seatId) => room.bank(seatId));
  });

  socket.on("game:roll", () => {
    const seat = sockets.get(socket.id);
    guard(socket.id, (room, seatId) => room.doRoll(seatId));
    if (seat === undefined) {
      return;
    }
    // A farkle stays on screen for a beat so the player sees what killed them.
    const room = rooms.get(seat.code);
    if (room?.view().turn?.phase === "farkled") {
      setTimeout(() => {
        const still = rooms.get(seat.code);
        if (still !== undefined && still.view().turn?.phase === "farkled") {
          still.advanceTurn();
          broadcast(seat.code);
        }
      }, FARKLE_PAUSE_MS);
    }
  });

  socket.on("disconnect", () => {
    const seat = sockets.get(socket.id);
    sockets.delete(socket.id);
    if (seat === undefined) {
      return;
    }
    const room = rooms.get(seat.code);
    if (room === undefined) {
      return;
    }
    room.disconnect(seat.seatId);
    broadcast(seat.code);
    if (room.isEmpty) {
      setTimeout(() => {
        const still = rooms.get(seat.code);
        if (still !== undefined && still.isEmpty) {
          rooms.delete(seat.code);
        }
      }, EMPTY_ROOM_TTL_MS);
    }
  });
});

http.listen(PORT, () => {
  console.log(`greed server listening on http://localhost:${PORT}`);
});
