import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeVenue } from "./helpers";

const getVenues = vi.fn();
const syncQuizSignup = vi.fn();

vi.mock("../api/lib/venueSource", () => ({ getVenues: (...args: unknown[]) => getVenues(...args) }));
vi.mock("../api/lib/kit", () => ({ syncQuizSignup: (...args: unknown[]) => syncQuizSignup(...args) }));
const loadSemanticIndex = vi.fn();
vi.mock("../api/lib/semantic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/lib/semantic")>();
  return { ...actual, loadSemanticIndex: (...args: unknown[]) => loadSemanticIndex(...args) };
});

import handler from "../api/match";

interface Res {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
}

async function call(method: string, body?: unknown): Promise<Res> {
  const out: Res = { statusCode: 0, body: undefined, headers: {} };
  const res: any = {
    setHeader(name: string, value: string) {
      out.headers[name] = value;
    },
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
  };
  await handler({ method, body } as any, res);
  return out;
}

const venues = [
  makeVenue({ id: "garden", name: "Leu Gardens", primary_vibe: "Garden Romance / Classic Elegance", review_url: "https://example.com/leu", capacity_max: 180 }),
  makeVenue({ id: "modern", name: "Modern <Hall> & Co", primary_vibe: "Modern + Editorial", source_url: "https://example.com/modern?a=1&b=2" }),
  makeVenue({ id: "rustic", name: "Barn", primary_vibe: "Relaxed + Rustic", runners_up_description: 'Say "hi"' }),
  makeVenue({ id: "classic", name: "Ballroom", primary_vibe: "Classic Elegance" }),
];

const valid = { email: "a@b.co", consent: true, answers: { vibe: "garden", guestMinimum: 50 } };

beforeEach(() => {
  getVenues.mockReset().mockResolvedValue({ venues });
  syncQuizSignup.mockReset().mockResolvedValue(undefined);
  delete process.env.KIT_API_KEY;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.KIT_API_KEY;
});

describe("POST /api/match validation", () => {
  it("rejects non-POST requests", async () => {
    const res = await call("GET");
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("POST");
  });
  it.each([undefined, "", "nope", "a@b", "a b@c.de"])("rejects invalid email %j", async (email) => {
    const res = await call("POST", { ...valid, email });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/valid email/);
  });
  it("rejects a missing body", async () => {
    expect((await call("POST", undefined)).statusCode).toBe(400);
  });
  it("requires explicit consent", async () => {
    const res = await call("POST", { ...valid, consent: false });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/consent/i);
    expect(syncQuizSignup).not.toHaveBeenCalled();
  });
  it("returns 500 when venue data cannot be loaded", async () => {
    getVenues.mockRejectedValue(new Error("down"));
    const res = await call("POST", valid);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/venue data/);
  });
});

describe("POST /api/match results", () => {
  it("returns a top match, three runners-up and display tags", async () => {
    const res = await call("POST", valid);
    expect(res.statusCode).toBe(200);
    expect(res.body.topVenue).toMatchObject({ id: "garden", name: "Leu Gardens", url: "https://example.com/leu", reviewUrl: "https://example.com/leu" });
    expect(res.body.runnersUp).toHaveLength(3);
    expect(res.body.tags.length).toBeGreaterThan(0);
    expect(res.body.resultMode).toBe("exact");
    expect(res.body.runnersUpDisclaimer).toBeNull();
  });

  it("uses runner-up descriptions and source urls as fallbacks", async () => {
    const res = await call("POST", valid);
    const barn = res.body.runnersUp.find((v: any) => v.id === "rustic");
    const modern = res.body.runnersUp.find((v: any) => v.id === "modern");
    expect(barn.note).toBe('Say "hi"');
    expect(modern.url).toBe("https://example.com/modern?a=1&b=2");
  });

  it("shows the narrowed-list disclaimer when a shown venue misses a requirement", async () => {
    const res = await call("POST", { ...valid, answers: { vibe: "garden", guestMinimum: 500 } });
    expect(res.body.resultMode).toBe("closest");
    expect(res.body.runnersUpDisclaimer).toMatch(/narrowed down/);
  });

  it("handles a quiz with no launch-ready venues", async () => {
    getVenues.mockResolvedValue({ venues: venues.map((v) => ({ ...v, launch_eligible: false })) });
    const res = await call("POST", valid);
    expect(res.statusCode).toBe(200);
    expect(res.body.topVenue).toBeNull();
    expect(res.body.runnersUp).toEqual([]);
  });

  it("defaults answers to empty", async () => {
    const res = await call("POST", { email: "a@b.co", consent: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.topVenue).toBeTruthy();
  });
});

describe("RANKING_MODE", () => {
  afterEach(() => {
    delete process.env.RANKING_MODE;
    loadSemanticIndex.mockReset();
  });
  it("uses the rule-based score by default", async () => {
    expect((await call("POST", valid)).body.rankingMode).toBe("rules");
  });
  it("uses semantic similarity when set to semantic", async () => {
    process.env.RANKING_MODE = "semantic";
    const actual = await vi.importActual<typeof import("../api/lib/semantic")>("../api/lib/semantic");
    loadSemanticIndex.mockImplementation(actual.loadSemanticIndex);
    const res = await call("POST", valid);
    expect(res.statusCode).toBe(200);
    expect(res.body.rankingMode).toBe("semantic");
    expect(res.body.topVenue.name).toBe("Leu Gardens");
  });
  it("falls back to rules, without failing the request, when the embeddings cannot be loaded", async () => {
    process.env.RANKING_MODE = "semantic";
    loadSemanticIndex.mockImplementation(() => {
      throw new Error("missing");
    });
    const res = await call("POST", valid);
    expect(res.statusCode).toBe(200);
    expect(res.body.rankingMode).toBe("rules");
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Semantic ranking unavailable/), expect.any(Error));
  });
});

describe("Kit sync from the endpoint", () => {
  it("is skipped, and never called, when KIT_API_KEY is not set", async () => {
    const res = await call("POST", valid);
    expect(res.body.kitSync).toBe("skipped");
    expect(syncQuizSignup).not.toHaveBeenCalled();
  });

  describe("with a key", () => {
    beforeEach(() => {
      process.env.KIT_API_KEY = "k";
    });

    it("syncs with the top venue's first style and the results HTML", async () => {
      const res = await call("POST", { ...valid, firstName: "  Karyn  ", weddingDate: "2027-10", source: "villa-festa-review" });
      expect(res.body.kitSync).toBe("ok");
      expect(syncQuizSignup).toHaveBeenCalledTimes(1);
      const arg = syncQuizSignup.mock.calls[0][0];
      expect(arg).toMatchObject({
        email: "a@b.co",
        firstName: "Karyn",
        weddingDate: "2027-10",
        signupSource: "villa-festa-review",
        topStyle: "Garden Romance",
      });
      expect(arg.quizResultsHtml.startsWith('<p><strong><a href="https://example.com/leu">Leu Gardens</a></strong><br>Matches')).toBe(true);
    });

    it("escapes HTML in venue names, notes and links", async () => {
      await call("POST", valid);
      const html: string = syncQuizSignup.mock.calls[0][0].quizResultsHtml;
      expect(html).toContain("Modern &lt;Hall&gt; &amp; Co");
      expect(html).not.toContain("<Hall>");
      expect(html).toContain('href="https://example.com/modern?a=1&amp;b=2"');
      expect(html).toContain("Say &quot;hi&quot;");
    });

    it("shows venues without a link as plain bold names", async () => {
      await call("POST", valid);
      const html: string = syncQuizSignup.mock.calls[0][0].quizResultsHtml;
      expect(html).toContain("<p><strong>Barn</strong>");
    });

    it("drops invalid optional inputs instead of forwarding them", async () => {
      await call("POST", { ...valid, firstName: "   ", weddingDate: "next spring", source: "a b<script>" });
      const arg = syncQuizSignup.mock.calls[0][0];
      expect(arg.firstName).toBeUndefined();
      expect(arg.weddingDate).toBeUndefined();
      expect(arg.signupSource).toBeUndefined();
    });

    it("rejects out-of-range months and non-string inputs", async () => {
      await call("POST", { ...valid, weddingDate: "2027-13", firstName: 42, source: 7 });
      const arg = syncQuizSignup.mock.calls[0][0];
      expect(arg.weddingDate).toBeUndefined();
      expect(arg.firstName).toBeUndefined();
      expect(arg.signupSource).toBeUndefined();
    });

    it("caps first name length", async () => {
      await call("POST", { ...valid, firstName: "x".repeat(200) });
      expect(syncQuizSignup.mock.calls[0][0].firstName).toHaveLength(60);
    });

    it("sends no style when the top venue's first style is not one of the five", async () => {
      getVenues.mockResolvedValue({ venues: [makeVenue({ primary_vibe: "Industrial Chic" })] });
      await call("POST", { ...valid, answers: {} });
      expect(syncQuizSignup.mock.calls[0][0].topStyle).toBeNull();
    });

    it("still returns the results, reporting failed, when Kit errors", async () => {
      syncQuizSignup.mockRejectedValue(new Error("Kit down"));
      const res = await call("POST", valid);
      expect(res.statusCode).toBe(200);
      expect(res.body.kitSync).toBe("failed");
      expect(res.body.topVenue.name).toBe("Leu Gardens");
      expect(console.error).toHaveBeenCalled();
    });
  });
});
