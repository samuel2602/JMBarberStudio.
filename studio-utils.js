const STUDIO = {
  WORK_START: 7,
  WORK_END: 21,
  PRICE: 16000,
  BARBER_PHONE: "3014300748",
  CLIENT_WINDOW_DAYS: 7,
  MAX_BOOKINGS_PER_WINDOW: 2
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeLocalDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateKey, days) {
  const date = makeLocalDate(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function prettyDate(dateKey) {
  return makeLocalDate(dateKey).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function prettyDateShort(dateKey) {
  return makeLocalDate(dateKey).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function timeLabel(time) {
  const [hour] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "p.m." : "a.m.";
  const hour12 = hour % 12 || 12;
  return `${hour12}:00 ${suffix}`;
}

function defaultTimesRange() {
  const times = [];
  for (let hour = STUDIO.WORK_START; hour < STUDIO.WORK_END; hour += 1) {
    times.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return times;
}

function getClientWindowStart() {
  return toDateKey(new Date());
}

function getClientWindowEnd() {
  return addDays(getClientWindowStart(), STUDIO.CLIENT_WINDOW_DAYS - 1);
}

function isPastDate(dateKey) {
  return dateKey < getClientWindowStart();
}

function isInClientWindow(dateKey) {
  return dateKey >= getClientWindowStart() && dateKey <= getClientWindowEnd();
}

function weeksBetween(startKey, targetKey) {
  const start = makeLocalDate(startKey).getTime();
  const target = makeLocalDate(targetKey).getTime();
  return Math.floor((target - start) / (7 * 24 * 60 * 60 * 1000));
}

function matchesVipFrequency(vip, dateKey) {
  if (!vip.active || dateKey < vip.start_date) return false;
  if (makeLocalDate(dateKey).getDay() !== vip.day_of_week) return false;
  if (vip.frequency === "weekly") return true;
  if (vip.frequency === "biweekly") return weeksBetween(vip.start_date, dateKey) % 2 === 0;
  return false;
}

function getVipOccurrencesForDate(vipSchedules, exceptions, dateKey) {
  const occurrences = [];

  vipSchedules.forEach((vip) => {
    if (!matchesVipFrequency(vip, dateKey)) return;

    const exception = exceptions.find(
      (item) => item.vip_schedule_id === vip.id && item.original_date === dateKey
    );

    if (exception?.action === "skip") return;

    if (exception?.action === "reschedule") {
      occurrences.push({
        vip,
        time: exception.new_time || vip.time,
        movedTo: exception.new_date,
        movedTime: exception.new_time,
        originalDate: dateKey,
        exceptionId: exception.id,
        isRescheduledAway: true
      });
      return;
    }

    occurrences.push({
      vip,
      time: vip.time,
      originalDate: dateKey,
      isRescheduledAway: false
    });
  });

  exceptions.forEach((exception) => {
    if (exception.action !== "reschedule" || exception.new_date !== dateKey) return;
    const vip = vipSchedules.find((item) => item.id === exception.vip_schedule_id);
    if (!vip || !vip.active) return;

    occurrences.push({
      vip,
      time: exception.new_time || vip.time,
      originalDate: exception.original_date,
      exceptionId: exception.id,
      isRescheduledTo: true
    });
  });

  return occurrences;
}

function frequencyLabel(frequency) {
  if (frequency === "biweekly") return "Cada 15 dias";
  return "Cada semana";
}

async function loadDayScheduleRecord(dateKey) {
  const { data, error } = await db
    .from("day_schedules")
    .select("hours, closed")
    .eq("date", dateKey)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function isDayClosed(dateKey) {
  const record = await loadDayScheduleRecord(dateKey);
  return Boolean(record?.closed);
}

async function loadDaySchedule(dateKey) {
  const record = await loadDayScheduleRecord(dateKey);
  if (record?.closed) return [];
  return record?.hours?.length ? [...record.hours].sort() : defaultTimesRange();
}

function summarizeDaySlots(slots) {
  if (!slots.length) {
    return { closed: true, full: false, freeCount: 0, totalCount: 0 };
  }

  const freeCount = slots.filter((slot) => slot.status === "free").length;
  return {
    closed: false,
    full: freeCount === 0,
    freeCount,
    totalCount: slots.length
  };
}

async function loadUserAppointmentsInWindow(userId, startKey, endKey) {
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startKey)
    .lte("date", endKey)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadBlockedForDate(dateKey) {
  const { data, error } = await db
    .from("blocked_slots")
    .select("*")
    .eq("date", dateKey);

  if (error) throw error;
  return data;
}

async function loadAppointmentsForDate(dateKey) {
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("date", dateKey)
    .order("time", { ascending: true });

  if (error) throw error;
  return data;
}

async function loadVipData() {
  const [vipResult, exceptionResult] = await Promise.all([
    db.from("vip_schedules").select("*").eq("active", true),
    db.from("vip_exceptions").select("*")
  ]);

  if (vipResult.error) throw vipResult.error;
  if (exceptionResult.error) throw exceptionResult.error;

  return {
    vipSchedules: vipResult.data || [],
    vipExceptions: exceptionResult.data || []
  };
}

async function buildDaySlots(dateKey, vipSchedules, vipExceptions) {
  const closed = await isDayClosed(dateKey);
  if (closed) return [];

  const [workingHours, appointments, blockedSlots, vipOccurrences] = await Promise.all([
    loadDaySchedule(dateKey),
    loadAppointmentsForDate(dateKey),
    loadBlockedForDate(dateKey),
    Promise.resolve(getVipOccurrencesForDate(vipSchedules, vipExceptions, dateKey))
  ]);

  const appointmentByTime = new Map(appointments.map((item) => [item.time, item]));
  const blockedByTime = new Map(blockedSlots.map((item) => [item.time, item]));
  const vipByTime = new Map();

  vipOccurrences.forEach((occurrence) => {
    if (!occurrence.isRescheduledAway) {
      vipByTime.set(occurrence.time, occurrence);
    }
  });

  return workingHours.map((time) => {
    if (appointmentByTime.has(time)) {
      return {
        time,
        status: "booked",
        appointment: appointmentByTime.get(time)
      };
    }

    if (vipByTime.has(time)) {
      return {
        time,
        status: "vip",
        vip: vipByTime.get(time)
      };
    }

    if (blockedByTime.has(time)) {
      return {
        time,
        status: "blocked",
        blocked: blockedByTime.get(time)
      };
    }

    return { time, status: "free" };
  });
}

async function countUserBookingsInWindow(userId, startKey, endKey) {
  const { data, error } = await db
    .from("appointments")
    .select("id")
    .eq("user_id", userId)
    .gte("date", startKey)
    .lte("date", endKey);

  if (error) throw error;
  return data.length;
}
