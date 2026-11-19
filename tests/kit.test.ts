import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOrCreateTag, syncQuizSignup, tagSubscriberByEmail, upsertSubscriber } from "../api/lib/kit";

interface Call {
  method: string;
  path: string;
  body: any;
  apiKey: string | undefined;
}

let calls: Call[];
let existingTags: string[];
let failPath: string | null;

function installFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = String(url).replace("https://api.kit.com/v4", "");
      const headers = init.headers as Record<string, string>;
      calls.push({ method: init.method ?? "GET", path, body: init.body ? JSON.parse(String(init.body)) : undefined, apiKey: headers["X-Kit-Api-Key"] });
      const respond = (data: unknown, ok = true, status = 200) => ({ ok, status, json: async () => data, text: async () => JSON.stringify(data) });
      if (failPath && path === failPath) return respond({ error: "boom" }, false, 500);
      if (path === "/subscribers") return respond({ subscriber: { id: 7, email_address: "a@b.co", first_name: null, state: "active" } });
      if (path === "/subscribers/7/tags") return respond({ tags: existingTags.map((name) => ({ name })) });
      if (path === "/tags") return respond({ tag: { id: 99, name: (calls[calls.length - 1].body as { name: string }).name } });
      return respond({});
    })
  );
}

beforeEach(() => {
  process.env.KIT_API_KEY = "secret-key";
  existingTags = [];
  failPath = null;
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.KIT_API_KEY;
});

const signup = {
  email: "a@b.co",
  firstName: "Karyn",
  weddingDate: "2027-10",
  signupSource: "villa-festa-review",
  topStyle: "Garden Romance" as const,
  quizResultsHtml: "<p>results</p>",
};

describe("kit client primitives", () => {
  it("sends the API key header and JSON body", async () => {
    await upsertSubscriber("a@b.co", { firstName: "Karyn", fields: { top_style: "x" } });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/subscribers",
      apiKey: "secret-key",
      body: { email_address: "a@b.co", first_name: "Karyn", fields: { top_style: "x" } },
    });
  });

  it("omits empty first name and empty fields", async () => {
    await upsertSubscriber("a@b.co", { fields: {} });
    expect(calls[0].body).toEqual({ email_address: "a@b.co" });
    await upsertSubscriber("a@b.co");
    expect(calls[1].body).toEqual({ email_address: "a@b.co" });
  });

  it("resolves a tag id and tags a subscriber by email", async () => {
    expect(await resolveOrCreateTag("Quiz taker")).toBe(99);
    await tagSubscriberByEmail(99, "a@b.co");
    expect(calls[1]).toMatchObject({ method: "POST", path: "/tags/99/subscribers", body: { email_address: "a@b.co" } });
  });

  it("throws a descriptive error when Kit rejects a call", async () => {
    failPath = "/subscribers";
    await expect(upsertSubscriber("a@b.co")).rejects.toThrow(/Kit API \/subscribers failed \(500\)/);
  });

  it("throws when no API key is configured", async () => {
    delete process.env.KIT_API_KEY;
    await expect(upsertSubscriber("a@b.co")).rejects.toThrow("KIT_API_KEY is not set");
  });
});

describe("syncQuizSignup", () => {
  it("creates the subscriber, tags Quiz taker, then adds the style tag and top_style", async () => {
    await syncQuizSignup(signup);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /subscribers",
      "POST /tags",
      "POST /tags/99/subscribers",
      "GET /subscribers/7/tags",
      "POST /subscribers",
      "POST /tags",
      "POST /tags/99/subscribers",
    ]);
    expect(calls[0].body).toEqual({
      email_address: "a@b.co",
      first_name: "Karyn",
      fields: { quiz_results: "<p>results</p>", wedding_date: "2027-10", signup_source: "villa-festa-review" },
    });
    expect(calls[1].body).toEqual({ name: "Quiz taker" });
    expect(calls[4].body).toEqual({ email_address: "a@b.co", fields: { top_style: "Garden Romance" } });
    expect(calls[5].body).toEqual({ name: "Garden Romance" });
  });

  it("leaves the style alone when the subscriber already has a style tag (retake)", async () => {
    existingTags = ["Quiz taker", "classic elegance"]; // case-insensitive match
    await syncQuizSignup({ ...signup, topStyle: "Modern + Editorial" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /subscribers",
      "POST /tags",
      "POST /tags/99/subscribers",
      "GET /subscribers/7/tags",
    ]);
    expect(JSON.stringify(calls)).not.toContain("Modern + Editorial");
  });

  it("ignores non-style tags when deciding whether a style already exists", async () => {
    existingTags = ["Quiz taker", "Inquired", "Married"];
    await syncQuizSignup(signup);
    expect(calls.some((c) => c.body?.name === "Garden Romance")).toBe(true);
  });

  it("only tags Quiz taker when the venue has no recognised style", async () => {
    await syncQuizSignup({ ...signup, topStyle: null });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /subscribers", "POST /tags", "POST /tags/99/subscribers"]);
  });

  it("omits optional fields that were not provided", async () => {
    await syncQuizSignup({ email: "a@b.co", topStyle: null, quizResultsHtml: "<p>x</p>" });
    expect(calls[0].body).toEqual({ email_address: "a@b.co", fields: { quiz_results: "<p>x</p>" } });
  });

  it("propagates Kit failures so the caller can log them", async () => {
    failPath = "/tags";
    await expect(syncQuizSignup(signup)).rejects.toThrow(/Kit API \/tags failed/);
  });
});
