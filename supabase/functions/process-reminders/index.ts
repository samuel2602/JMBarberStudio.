import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function appointmentDateTimeIso(dateKey: string, time: string) {
  return `${dateKey}T${time}:00`;
}

function reminderSendAfterIso(dateKey: string, time: string) {
  const appointmentMs = new Date(appointmentDateTimeIso(dateKey, time)).getTime();
  return new Date(appointmentMs - 24 * 60 * 60 * 1000).toISOString();
}

function isWithinNextHour(isoDate: string) {
  const target = new Date(isoDate).getTime();
  const now = Date.now();
  return target >= now && target <= now + 60 * 60 * 1000;
}

function reminderMessage(name: string, dateKey: string, time: string, isVip = false) {
  const prefix = isVip ? "Recordatorio VIP" : "Recordatorio";
  return `${prefix}: Hola ${name}, manana tienes cita a las ${time}. (${dateKey})`;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("CRON_SECRET");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Faltan variables de Supabase" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (cronSecret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);

    const { data: appointments, error: appointmentsError } = await admin
      .from("appointments")
      .select("*")
      .eq("date", tomorrowKey);

    if (appointmentsError) throw appointmentsError;

    const queued = [];

    for (const appointment of appointments || []) {
      const sendAfter = reminderSendAfterIso(appointment.date, appointment.time);
      if (!isWithinNextHour(sendAfter)) continue;

      const { data: existing } = await admin
        .from("notification_log")
        .select("id")
        .eq("phone", appointment.phone)
        .eq("type", "reminder_client")
        .eq("related_date", appointment.date)
        .eq("related_time", appointment.time)
        .limit(1);

      if (existing?.length) continue;

      const message = reminderMessage(appointment.name, appointment.date, appointment.time, false);
      await admin.from("notification_log").insert({
        phone: appointment.phone,
        message,
        type: "reminder_client",
        related_date: appointment.date,
        related_time: appointment.time,
        status: "pending"
      });

      await fetch(`${supabaseUrl}/functions/v1/send-notifications`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: appointment.phone,
          message,
          title: "Recordatorio de cita",
          role: "client",
          sendAfter
        })
      });

      queued.push({ phone: appointment.phone, type: "reminder_client" });
    }

    return new Response(JSON.stringify({ ok: true, queued }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
