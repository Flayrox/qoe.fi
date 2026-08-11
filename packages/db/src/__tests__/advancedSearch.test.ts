import { describe, expect, it } from "vitest";

process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.DIRECT_URL = "postgresql://postgres:postgres@localhost:5432/postgres";

/**
 * Moteur d'extraction de paramètres de recherche inspiré du standard Bluesky (v2 search params).
 */
export function extractSearchFilters(query: string) {
  let cleanQuery = query.trim();
  const filters: {
    q: string;
    author?: string;
    mentions?: string;
    hashtags: string[];
    since?: string;
  } = {
    q: "",
    hashtags: [],
  };

  // Extraction of from:username
  const fromMatch = cleanQuery.match(/from:@?([a-zA-Z0-9_.-]+)/i);
  if (fromMatch) {
    filters.author = fromMatch[1];
    cleanQuery = cleanQuery.replace(fromMatch[0], "").trim();
  }

  // Extraction of mentions: / to:
  const mentionMatch = cleanQuery.match(/(?:mentions|to):@?([a-zA-Z0-9_.-]+)/i);
  if (mentionMatch) {
    filters.mentions = mentionMatch[1];
    cleanQuery = cleanQuery.replace(mentionMatch[0], "").trim();
  }

  // Extraction of hashtags
  const hashtagMatches = Array.from(cleanQuery.matchAll(/#([a-zA-Z0-9_]+)/g));
  if (hashtagMatches.length > 0) {
    filters.hashtags = hashtagMatches.map((m) => m[1].toLowerCase());
    cleanQuery = cleanQuery.replace(/#[a-zA-Z0-9_]+/g, "").trim();
  }

  // Extraction of since:YYYY-MM-DD
  const sinceMatch = cleanQuery.match(/since:(\d{4}-\d{2}-\d{2})/i);
  if (sinceMatch) {
    filters.since = `${sinceMatch[1]}T00:00:00Z`;
    cleanQuery = cleanQuery.replace(sinceMatch[0], "").trim();
  }

  filters.q = cleanQuery.replace(/\s+/g, " ");
  return filters;
}

describe("Advanced Search Parameter Extraction", () => {
  it("should pass bare query text through untouched", () => {
    const res = extractSearchFilters("hello world");
    expect(res).toEqual({
      q: "hello world",
      hashtags: [],
    });
  });

  it("should lift from: into author and strip it from q", () => {
    const res = extractSearchFilters("cats from:alice");
    expect(res).toEqual({
      q: "cats",
      author: "alice",
      hashtags: [],
    });
  });

  it("should strip leading @ from from: and mentions:", () => {
    const res = extractSearchFilters("tech from:@alex mentions:@qoe");
    expect(res).toEqual({
      q: "tech",
      author: "alex",
      mentions: "qoe",
      hashtags: [],
    });
  });

  it("should accumulate multiple hashtags into hashtags array", () => {
    const res = extractSearchFilters("news #tech #ai #innovation");
    expect(res).toEqual({
      q: "news",
      hashtags: ["tech", "ai", "innovation"],
    });
  });

  it("should normalize ISO date in since: operator to UTC midnight timestamp", () => {
    const res = extractSearchFilters("thoughts since:2026-08-01");
    expect(res).toEqual({
      q: "thoughts",
      since: "2026-08-01T00:00:00Z",
      hashtags: [],
    });
  });
});
