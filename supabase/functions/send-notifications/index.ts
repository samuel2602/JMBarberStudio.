import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function normalizePhone(phone: string) {
  return phone.startsWith("+") ? phone : `+57${phone}`;
}

async function sendTwilioSms(phone: string, message: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, pending: true, channel: "sms" };
  }

  const auth = btoa(`${accountSid}:${authToken}`);
  const body = new URLSearchParams({
    To: normalizePhone(phone),
    From: fromNumber,
    Body: message
  });

  const twilioResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const twilioData = await twilioResponse.json();
  if (!twilioResponse.ok) {
    return { ok: false, channel: "sms", error: twilioData };
  }

  return { ok: true, channel: "sms", sid: twilioData.sid };
}

async function sendOneSignalPush({
  phone,
  role,
  title,
  message,
  sendAfter
}: {
  phone: string;
  role?: string | null;
  title: string;
  message: string;
  sendAfter?: string | null;
}) {
  const appId = Deno.env.get("ONESIGNAL_APP_ID");
  const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("PRIVATE_SERVICE_ROLE_KEY");

  if (!appId || !restKey || !supabaseUrl || !serviceRoleKey) {
    return { ok: false, pending: true, channel: "push" };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  let query = admin.from("push_subscriptions").select("player_id").eq("phone", phone);
  if (role) query = query.eq("role", role);

  const { data: subscriptions, error } = await query;
  if (error || !subscriptions?.length) {
    return { ok: false, channel: "push", detail: "Sin suscripciones push" };
  }

  const playerIds = subscriptions.map((item) => item.player_id).filter(Boolean);
  if (!playerIds.length) {
    return { ok: false, channel: "push", detail: "Sin player IDs" };
  }

  const payload: Record<string, unknown> = {
    app_id: appId,
    include_player_ids: playerIds,
    headings: { en: title, es: title },
    contents: { en: message, es: message }
  };

  if (sendAfter) {
    payload.send_after = sendAfter;
  }

  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${restKey}`
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok) {
    return { ok: false, channel: "push", error: result };
  }

  return { ok: true, channel: "push", id: result.id };
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      phone,
      message,
      title = "JMbarber",
      role = null,
      sendAfter = null
    } = await request.json();

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "phone y message son requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const [pushResult, smsResult] = await Promise.all([
      sendOneSignalPush({ phone, role, title, message, sendAfter }),
      sendAfter ? Promise.resolve({ ok: false, skipped: true, channel: "sms" }) : sendTwilioSms(phone, message)
    ]);

    const ok = pushResult.ok || smsResult.ok;
    const pending = pushResult.pending || smsResult.pending;

    return new Response(JSON.stringify({
      ok,
      pending,
      push: pushResult,
      sms: smsResult
    }), {
      status: ok ? 200 : pending ? 202 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
