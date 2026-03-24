import { describe, it, expect } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

describe("Supabase connection", () => {
  it("should have SUPABASE_URL and SUPABASE_ANON_KEY set", () => {
    expect(SUPABASE_URL).toBeTruthy();
    expect(SUPABASE_ANON_KEY).toBeTruthy();
  });

  it("should be able to fetch members from Supabase", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/members?limit=1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "count=exact",
      },
    });
    expect(res.status).toBe(206);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("name");
  });

  it("should be able to fetch book_titles from Supabase", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/book_titles?limit=1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "count=exact",
      },
    });
    expect(res.status).toBe(206);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("title");
  });
});
