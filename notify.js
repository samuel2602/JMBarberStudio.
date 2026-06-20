async function queueNotification({
  phone,
  message,
  type,
  relatedDate = null,
  relatedTime = null,
  title = "JMbarber",
  role = null,
  sendAfter = null
}) {
  const { error } = await db.from("notification_log").insert({
    phone,
    message,
    type,
    related_date: relatedDate,
    related_time: relatedTime,
    status: "pending"
  });

  if (error) {
    console.error("No se pudo encolar la notificacion.", error);
    return false;
  }

  try {
    await db.functions.invoke("send-notifications", {
      body: {
        phone,
        message,
        title,
        role,
        sendAfter
      }
    });
  } catch (invokeError) {
    console.warn("Notificacion pendiente de configurar en Supabase Edge Function.", invokeError);
  }

  return true;
}

function bookingConfirmationMessage({ name, dateKey, time }) {
  return `Hola ${name}, reserva exitosa para ${prettyDateShort(dateKey)} a las ${timeLabel(time)}. Servicio: Corte $16.000.`;
}

function barberBookingAlertMessage({ name, phone, dateKey, time }) {
  return `Nueva reserva de ${name} (${phone}) el ${prettyDateShort(dateKey)} a las ${timeLabel(time)}.`;
}

function reminderMessage({ name, dateKey, time, isVip = false }) {
  const prefix = isVip ? "Recordatorio VIP" : "Recordatorio";
  return `${prefix}: Hola ${name}, manana tienes cita a las ${timeLabel(time)} (${prettyDateShort(dateKey)}).`;
}

function appointmentDateTimeIso(dateKey, time) {
  return `${dateKey}T${time}:00`;
}

function reminderSendAfterIso(dateKey, time) {
  const appointmentMs = new Date(appointmentDateTimeIso(dateKey, time)).getTime();
  return new Date(appointmentMs - 24 * 60 * 60 * 1000).toISOString();
}

async function notifyBookingCreated(appointment) {
  const clientMessage = bookingConfirmationMessage({
    name: appointment.name,
    dateKey: appointment.date,
    time: appointment.time
  });

  await Promise.all([
    queueNotification({
      phone: appointment.phone,
      message: clientMessage,
      title: "Reserva exitosa",
      type: "booking_client",
      role: "client",
      relatedDate: appointment.date,
      relatedTime: appointment.time
    }),
    queueNotification({
      phone: STUDIO.BARBER_PHONE,
      message: barberBookingAlertMessage({
        name: appointment.name,
        phone: appointment.phone,
        dateKey: appointment.date,
        time: appointment.time
      }),
      title: "Nueva reserva",
      type: "booking_barber",
      role: "barber",
      relatedDate: appointment.date,
      relatedTime: appointment.time
    }),
    queueNotification({
      phone: appointment.phone,
      message: reminderMessage({
        name: appointment.name,
        dateKey: appointment.date,
        time: appointment.time,
        isVip: false
      }),
      title: "Recordatorio de cita",
      type: "reminder_client",
      role: "client",
      relatedDate: appointment.date,
      relatedTime: appointment.time,
      sendAfter: reminderSendAfterIso(appointment.date, appointment.time)
    })
  ]);
}

async function wasReminderQueued(phone, type, relatedDate, relatedTime = null) {
  let query = db
    .from("notification_log")
    .select("id")
    .eq("phone", phone)
    .eq("type", type)
    .eq("related_date", relatedDate)
    .limit(1);

  if (relatedTime) {
    query = query.eq("related_time", relatedTime);
  }

  const { data, error } = await query;
  if (error) return false;
  return Boolean(data?.length);
}

async function processDueReminders(currentUser) {
  const tomorrowKey = addDays(getClientWindowStart(), 1);
  const { data: appointments, error } = await db
    .from("appointments")
    .select("*")
    .eq("date", tomorrowKey);

  if (error) return;

  const mine = (appointments || []).filter((item) => item.phone === currentUser.phone);
  for (const appointment of mine) {
    const message = reminderMessage({
      name: appointment.name,
      dateKey: appointment.date,
      time: appointment.time,
      isVip: false
    });
    showInAppNotification(message);

    const alreadyQueued = await wasReminderQueued(
      appointment.phone,
      "reminder_client",
      appointment.date,
      appointment.time
    );

    if (!alreadyQueued) {
      await queueNotification({
        phone: appointment.phone,
        message,
        title: "Recordatorio de cita",
        type: "reminder_client",
        role: "client",
        relatedDate: appointment.date,
        relatedTime: appointment.time,
        sendAfter: reminderSendAfterIso(appointment.date, appointment.time)
      });
    }
  }

  const { vipSchedules, vipExceptions } = await loadVipData();
  const vipTomorrow = getVipOccurrencesForDate(vipSchedules, vipExceptions, tomorrowKey)
    .filter((item) => !item.isRescheduledAway && item.vip.phone === currentUser.phone);

  for (const occurrence of vipTomorrow) {
    const message = reminderMessage({
      name: occurrence.vip.name,
      dateKey: tomorrowKey,
      time: occurrence.time,
      isVip: true
    });
    showInAppNotification(message);

    const alreadyQueued = await wasReminderQueued(
      occurrence.vip.phone,
      "reminder_vip",
      tomorrowKey,
      occurrence.time
    );

    if (!alreadyQueued) {
      await queueNotification({
        phone: occurrence.vip.phone,
        message,
        title: "Recordatorio VIP",
        type: "reminder_vip",
        role: "client",
        relatedDate: tomorrowKey,
        relatedTime: occurrence.time,
        sendAfter: reminderSendAfterIso(tomorrowKey, occurrence.time)
      });
    }
  }
}

function showInAppNotification(message) {
  const banner = document.getElementById("reminderBanner");
  if (!banner) return;
  banner.querySelector("p").textContent = message;
  banner.classList.remove("hidden");
}
