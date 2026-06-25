import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Schema = z.object({
  email: z.string().trim().email().optional().or(z.literal("")),
  doc: z.string().trim().optional().or(z.literal("")),
  user_id: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ eligible: true, reason: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { email, doc, user_id } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin.rpc("trial_eligibility", {
      _email: email || null,
      _doc: doc || null,
      _user_id: user_id || null,
    });

    if (error) {
      return new Response(JSON.stringify({ eligible: true, reason: null, error: error.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data ?? { eligible: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ eligible: true, reason: null, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});