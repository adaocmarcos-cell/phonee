import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/free-trial-signup`;

function payload(email: string) {
  return {
    email,
    full_name: "IT Tester",
    whatsapp: "11999999999",
    password: "Test1234!secure",
    instagram: "ittester",
    store_name: "IT Store",
    city: "São Paulo",
    state: "SP",
  };
}

async function call(body: unknown) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON}`,
      "apikey": ANON,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

Deno.test("free-trial-signup: reaproveita por e-mail case-insensitive sem duplicar nem alterar trial_ends_at", async () => {
  const unique = `it-${crypto.randomUUID().slice(0, 8)}@phonee-test.dev`;

  const first = await call(payload(unique));
  if (first.json?.code === "rate_limited") {
    console.warn("skip: rate limited by IP");
    return;
  }
  assertEquals(first.status, 200, `first call failed: ${JSON.stringify(first.json)}`);
  assert(first.json.ok, "first should be ok");
  const firstEnds = first.json.trial_ends_at as string;
  assert(firstEnds, "first trial_ends_at present");

  // Second call with UPPERCASE email — must reuse the same partner_trials row
  const second = await call(payload(unique.toUpperCase()));
  if (second.json?.code === "rate_limited") {
    console.warn("skip: rate limited by IP");
    return;
  }
  assertEquals(second.status, 200, `second call failed: ${JSON.stringify(second.json)}`);
  assertEquals(second.json.reused, true, "second call must be reused");
  assertEquals(
    second.json.trial_ends_at,
    firstEnds,
    "trial_ends_at must NOT change when reusing",
  );
});

Deno.test("free-trial-signup: validação de campos obrigatórios", async () => {
  const res = await call({ ...payload("bad"), email: "invalido" });
  assertEquals(res.json.code, "validation");
});