import { describe, expect, it } from "vitest";
import type { Lookups } from "./meta.js";
import { headTags, inject, pageFor } from "./meta.js";

/** A room with one game and one table in it. */
const room: Lookups = {
  game: (id) =>
    id === "blackjack"
      ? { name: "Blackjack", blurb: "Beat the dealer to twenty-one.", maxSeats: 6 }
      : null,
  table: (code) =>
    code === "6PMKG" ? { game: "Blackjack", host: "Ada", seats: 3, maxSeats: 6 } : null,
};

const SITE = "https://back.example";

describe("what an address says about itself", () => {
  it("puts the host and the seats where an unfurler will read them", () => {
    const page = pageFor("/6PMKG", SITE, room);

    expect(page.title).toBe("Ada’s blackjack table · The Back Room");
    expect(page.description).toContain("3 of 6 seats");
    expect(page.description).toContain("6PMKG");
    expect(page.image).toBe("https://back.example/og/table/6PMKG.png");
  });

  it("finds the same table down either address", () => {
    /*
     * A code is an address on its own, and the link people paste is whichever
     * one they happened to have open. Both have to unfurl into the same table.
     */
    const bare = pageFor("/6PMKG", SITE, room);
    const under = pageFor("/blackjack/6pmkg", SITE, room);

    expect(under.title).toBe(bare.title);
    expect(under.image).toBe(bare.image);
  });

  it("keeps a table out of search results, and the game it is played at in", () => {
    // A table is a room that will not exist next week; the game outlives it.
    // Asserted on the tag rather than the flag, because the tag is the thing a
    // crawler actually obeys.
    expect(headTags(pageFor("/6PMKG", SITE, room))).toContain('content="noindex, follow"');
    expect(headTags(pageFor("/blackjack", SITE, room))).toContain('content="index, follow"');
  });

  it("describes a game from its own blurb rather than a second one", () => {
    const page = pageFor("/blackjack", SITE, room);

    expect(page.title).toBe("Blackjack · The Back Room");
    expect(page.description).toContain("Beat the dealer to twenty-one.");
    expect(page.image).toBe("https://back.example/og/blackjack.png");
  });

  it("falls back to the room when the code is not a table any more", () => {
    // The link outlives the table, and a dead code is a link somebody is
    // following right now.
    const page = pageFor("/ZZZZZ", SITE, room);

    expect(page.title).toBe("The Back Room");
    expect(page.image).toBe("https://back.example/og/site.png");
    expect(page.noindex).toBe(true);
  });

  it("keeps somebody's own pages out of search", () => {
    for (const path of ["/me", "/admin", "/style"]) {
      expect(pageFor(path, SITE, room).noindex).toBe(true);
    }
  });

  it("gives the door a canonical address without a trailing slash", () => {
    expect(pageFor("/", SITE, room).url).toBe("https://back.example");
    expect(pageFor("/blackjack", SITE, room).url).toBe("https://back.example/blackjack");
  });
});

describe("the head that goes out", () => {
  it("does not let a name become markup", () => {
    /*
     * A display name is whatever somebody typed, and it lands in an attribute
     * in a document served to everybody who follows the link. This is the only
     * thing standing between those two facts.
     */
    const nasty: Lookups = {
      game: () => null,
      table: () => ({
        game: "Blackjack",
        host: '"><script>alert(1)</script>',
        seats: 1,
        maxSeats: 6,
      }),
    };
    const html = headTags(pageFor("/6PMKG", SITE, nasty));

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // And the attribute it sits in is still closed by the quote we put there.
    expect(html).toContain("&quot;&gt;");
  });

  it("says the same thing to both kinds of unfurler", () => {
    const html = headTags(pageFor("/blackjack", SITE, room));

    expect(html).toContain('<meta property="og:title" content="Blackjack · The Back Room" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<link rel="canonical" href="https://back.example/blackjack" />');
  });
});

describe("writing the head into the page", () => {
  const shell = "<head>\n    <!--meta-->\n    <title>Old</title>\n    <!--/meta-->\n  </head>";

  it("replaces the defaults rather than adding to them", () => {
    const out = inject(shell, pageFor("/blackjack", SITE, room));

    expect(out).toContain("<title>Blackjack · The Back Room</title>");
    // The stale one is gone, not merely outnumbered.
    expect(out).not.toContain("<title>Old</title>");
    expect(out.match(/<title>/g)).toHaveLength(1);
  });

  it("leaves a page alone when there is nowhere to write", () => {
    // A build served by something simpler still has the defaults in it, which
    // is the whole reason those defaults are written down.
    const plain = "<head><title>Old</title></head>";

    expect(inject(plain, pageFor("/", SITE, room))).toBe(plain);
  });
});
