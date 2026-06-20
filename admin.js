const WORK_START = 7;
const WORK_END = 21;

const calendarGrid = document.getElementById("calendarGrid");
const monthTitle = document.getElementById("monthTitle");
const todayCount = document.getElementById("todayCount");
const monthCount = document.getElementById("monthCount");
const pendingCount = document.getElementById("pendingCount");
const pendingPill = document.getElementById("pendingPill");
const registrationRequests = document.getElementById("registrationRequests");
const modal = document.getElementById("dayModal");
const modalDate = document.getElementById("modalDate");
const modalSubtitle = document.getElementById("modalSubtitle");
const dayAppointments = document.getElementById("dayAppointments");
const closeModal = document.getElementById("closeModal");
const prevMonth = document.getElementById("prevMonth");
const nextMonth = document.getElementById("nextMonth");
const logoutBtn = document.getElementById("logoutBtn");
const toast = document.getElementById("toast");

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

let visibleMonth = new Date();
visibleMonth.setDate(1);

function requireBarber() {
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  if (currentUser.role !== "barber") {
    window.location.href = "loguin.html";
    return false;
  }
  return true;
}

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

function prettyDate(dateKey) {
  return makeLocalDate(dateKey).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function timeLabel(time) {
  const [hour] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "p.m." : "a.m.";
  const hour12 = hour % 12 || 12;
  return `${hour12}:00 ${suffix}`;
}

function timesRange() {
  const times = [];
  for (let hour = WORK_START; hour < WORK_END; hour += 1) {
    times.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return times;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 2600);
}

async function loadAppointmentsBetween(startKey, endKey) {
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .gte("date", startKey)
    .lte("date", endKey)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

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

async function loadUsers() {
  const { data, error } = await db
    .from("client_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

async function updateMetrics(monthAppointments) {
  const todayKey = toDateKey(new Date());
  const users = await loadUsers();
  const pendingUsers = users.filter((user) => user.status === "pending");

  todayCount.textContent = monthAppointments.filter((appointment) => appointment.date === todayKey).length;
  monthCount.textContent = monthAppointments.length;
  pendingCount.textContent = pendingUsers.length;
  pendingPill.textContent = `${pendingUsers.length} pendiente${pendingUsers.length === 1 ? "" : "s"}`;
}

async function renderRegistrationRequests() {
  let users = [];

  try {
    users = await loadUsers();
  } catch (error) {
    registrationRequests.innerHTML = `<div class="empty">No se pudieron cargar los registros.</div>`;
    console.error(error);
    return;
  }

  const pendingUsers = users.filter((user) => user.status === "pending");
  registrationRequests.innerHTML = "";

  if (pendingUsers.length === 0) {
    registrationRequests.innerHTML = `<div class="empty">No hay registros pendientes por revisar.</div>`;
    return;
  }

  pendingUsers.forEach((user) => {
    const item = document.createElement("div");
    item.className = "request-item";
    item.innerHTML = `
      <div>
        <strong>${user.name}</strong>
        <div class="muted small">${user.phone}</div>
      </div>
      <div class="request-actions">
        <button class="btn" type="button" data-action="approve">Aprobar</button>
        <button class="btn danger" type="button" data-action="reject">Rechazar</button>
      </div>
    `;

    item.querySelector('[data-action="approve"]').addEventListener("click", () => updateUserStatus(user.id, "approved"));
    item.querySelector('[data-action="reject"]').addEventListener("click", () => updateUserStatus(user.id, "rejected"));
    registrationRequests.appendChild(item);
  });
}

async function updateUserStatus(userId, status) {
  const { error } = await db
    .from("client_users")
    .update({
      status,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (error) {
    showToast("No se pudo actualizar el registro.");
    console.error(error);
    return;
  }

  await renderCalendar();
  await renderRegistrationRequests();
  showToast(status === "approved" ? "Cliente aprobado. Ya puede agendar." : "Registro rechazado.");
}

async function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 41);

  monthTitle.textContent = `${monthNames[month]} ${year}`;
  calendarGrid.innerHTML = `<div class="empty">Cargando calendario...</div>`;

  let appointments = [];
  try {
    appointments = await loadAppointmentsBetween(toDateKey(start), toDateKey(end));
  } catch (error) {
    calendarGrid.innerHTML = `<div class="empty">No se pudo cargar el calendario.</div>`;
    console.error(error);
    return;
  }

  calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = toDateKey(date);
    const dayAppointments = appointments.filter((appointment) => appointment.date === dateKey);
    const isCurrentMonth = date.getMonth() === month;
    const isToday = dateKey === toDateKey(new Date());

    const button = document.createElement("button");
    button.type = "button";
    button.className = `day${isCurrentMonth ? "" : " outside"}${isToday ? " today" : ""}`;
    button.innerHTML = `
      <span class="day-number">${date.getDate()}</span>
      <span class="day-meta">
        <span>${dayAppointments.length ? `${dayAppointments.length} citas` : "Libre"}</span>
        ${dayAppointments.length ? '<span class="dot"></span>' : ""}
      </span>
    `;
    button.addEventListener("click", () => openDay(dateKey));
    calendarGrid.appendChild(button);
  }

  await updateMetrics(appointments.filter((appointment) => makeLocalDate(appointment.date).getMonth() === month));
}

async function openDay(dateKey) {
  let appointments = [];

  try {
    appointments = await loadAppointmentsForDate(dateKey);
  } catch (error) {
    showToast("No se pudieron cargar las citas del dia.");
    console.error(error);
    return;
  }

  const busyByTime = new Map(appointments.map((appointment) => [appointment.time, appointment]));

  modalDate.textContent = prettyDate(dateKey);
  modalSubtitle.textContent = `${appointments.length} cita${appointments.length === 1 ? "" : "s"} agendada${appointments.length === 1 ? "" : "s"} - Horario de 7:00 a.m. a 9:00 p.m.`;
  dayAppointments.innerHTML = "";

  timesRange().forEach((time) => {
    const appointment = busyByTime.get(time);
    const row = document.createElement("div");
    row.className = `time-row${appointment ? " busy" : ""}`;

    if (appointment) {
      row.innerHTML = `
        <strong>${timeLabel(time)}</strong>
        <div>
          <strong>${appointment.name}</strong>
          <div class="muted small">${appointment.phone} - Corte - $16.000</div>
        </div>
        <button class="btn danger" type="button">Eliminar</button>
      `;
      row.querySelector("button").addEventListener("click", () => deleteAppointment(appointment.id, dateKey));
    } else {
      row.innerHTML = `
        <strong>${timeLabel(time)}</strong>
        <div class="muted">Horario libre</div>
        <span class="pill">Disponible</span>
      `;
    }

    dayAppointments.appendChild(row);
  });

  modal.classList.remove("hidden");
}

async function deleteAppointment(id, dateKey) {
  const { error } = await db.from("appointments").delete().eq("id", id);

  if (error) {
    showToast("No se pudo eliminar la cita.");
    console.error(error);
    return;
  }

  await renderCalendar();
  await openDay(dateKey);
  showToast("Cita eliminada del calendario.");
}

async function initAdmin() {
  if (!requireBarber()) return;

  await renderCalendar();
  await renderRegistrationRequests();

  prevMonth.addEventListener("click", async () => {
    visibleMonth.setMonth(visibleMonth.getMonth() - 1);
    await renderCalendar();
  });

  nextMonth.addEventListener("click", async () => {
    visibleMonth.setMonth(visibleMonth.getMonth() + 1);
    await renderCalendar();
  });

  closeModal.addEventListener("click", () => modal.classList.add("hidden"));

  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.add("hidden");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") modal.classList.add("hidden");
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
  });
}

initAdmin();
