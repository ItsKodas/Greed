import type session from "express-session";
import { readAuthConfig } from "./auth.js";
import { MongoStore } from "./mongo-store.js";
import { createGreedServer } from "./server.js";
import { MemoryStore } from "./store.js";
import type { Store } from "./store.js";

/**
 * Port precedence: an explicit --port flag, then PORT, then 3001. The flag
 * matters in dev because the harness that launches both processes sets PORT
 * for the web server, and the API must not inherit it.
 */
const portFlag = process.argv.indexOf("--port");
const PORT = Number(
  portFlag !== -1 ? process.argv[portFlag + 1] : (process.env["PORT"] ?? 3001),
);

const mongoUrl = process.env["MONGO_URL"];

async function main(): Promise<void> {
  let store: Store = new MemoryStore();
  let sessionStore: session.Store | undefined;

  if (mongoUrl !== undefined && mongoUrl.length > 0) {
    try {
      store = await MongoStore.connect(mongoUrl);
      // Loaded here rather than at the top: with no database configured the
      // server should not need a database driver present at all.
      const { default: MongoSessionStore } = await import("connect-mongo");
      sessionStore = MongoSessionStore.create({ mongoUrl });
      console.log("greed: profiles and chips are persistent");
    } catch (error) {
      // A database that will not answer should not take the game down with
      // it — losing persistence is better than losing the ability to play.
      console.error("greed: could not reach the database, running in memory", error);
    }
  } else {
    console.log("greed: no MONGO_URL, profiles and chips live in memory only");
  }

  const auth = readAuthConfig(process.env);
  if (auth === null) {
    console.log("greed: no Discord credentials, sign-in is disabled");
  }

  const server = createGreedServer({
    store,
    auth,
    sessionStore,
    clientOrigin: process.env["CLIENT_ORIGIN"] ?? "http://localhost:5173",
  });

  server.http.listen(PORT, () => {
    console.log(`greed server listening on http://localhost:${PORT}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0));
    });
  }
}

main().catch((error: unknown) => {
  // A misconfigured server should say what is wrong in one line, not bury it
  // in an unhandled-rejection stack.
  console.error(`greed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
