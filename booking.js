const SERVICE_PRICE = 16000;
const WORK_START = 7;
const WORK_END = 21;

const form = document.getElementById("bookingForm");
const dateInput = document.getElementById("date");
const timeInput = document.getElementById("time");
const slotsEl = document.getElementById("slots");
const selectedSummary = document.getElementById("selectedSummary");
const toast = document.getElementById("toast");

function getCurrentUser() {
  return JSON.parse(localStorage.getItem("currentUser") || "{}");
}

function normalizePhone(value) {
  return value.replace(/\D/g, "");
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long"
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
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 3200);
}

function setMinimumDate() {
  const today = toDateKey(new Date());
  dateInput.min = today;
  if (!dateInput.value) dateInput.value = today;
}

async function requireApprovedClient() {
  const currentUser = getCurrentUser();

  if (currentUser.role !== "client" || !currentUser.phone) {
    localStorage.removeItem("currentUser");
    window.location.href = "loguin.html";
    return null;
  }

  const { data, error } = await db
    .from("client_users")
    .select("*")
    .eq("phone", currentUser.phone)
    .maybeSingle();

  if (error || !data || data.status !== "approved") {
    localStorage.removeItem("currentUser");
    window.location.href = "loguin.html";
    return null;
  }

  localStorage.setItem("currentUser", JSON.stringify({
    id: data.id,
    name: data.name,
    phone: data.phone,
    role: "client"
  }));

  return data;
}

async function loadBusyTimes(date) {
  const { data, error } = await db
    .from("appointments")
    .select("time")
    .eq("date", date);

  if (error) throw error;
  return data.map((appointment) => appointment.time);
}

async function renderSlots() {
  const date = dateInput.value;
  let busyTimes = [];

  slotsEl.innerHTML = `<div class="empty">Cargando horarios...</div>`;
  timeInput.value = "";
  selectedSummary.textContent = date ? prettyDate(date) : "Sin seleccionar";

  try {
    busyTimes = await loadBusyTimes(date);
  } catch (error) {
    slotsEl.innerHTML = `<div class="empty">No se pudieron cargar los horarios.</div>`;
    console.error(error);
    return;
  }

  slotsEl.innerHTML = "";

  timesRange().forEach((time) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot";
    button.textContent = timeLabel(time);
    button.dataset.time = time;

    if (busyTimes.includes(time)) {
      button.disabled = true;
      button.classList.add("busy");
      button.title = "Horario ocupado";
    }

    button.addEventListener("click", () => {
      document.querySelectorAll(".slot.selected").forEach((slot) => slot.classList.remove("selected"));
      button.classList.add("selected");
      timeInput.value = time;
      selectedSummary.textContent = `${prettyDate(date)} - ${timeLabel(time)}`;
    });

    slotsEl.appendChild(button);
  });
}

function hydrateUser(user) {
  const nameInput = document.getElementById("clientName");
  const phoneInput = document.getElementById("clientPhone");

  if (user.name && nameInput) nameInput.value = user.name;
  if (user.phone && phoneInput) phoneInput.value = user.phone;
}

async function initBooking() {
  const approvedUser = await requireApprovedClient();
  if (!approvedUser) return;

  setMinimumDate();
  hydrateUser(approvedUser);
  await renderSlots();

  dateInput.addEventListener("change", renderSlots);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const user = getCurrentUser();
    const name = document.getElementById("clientName").value.trim();
    const phone = normalizePhone(document.getElementById("clientPhone").value);
    const date = dateInput.value;
    const time = timeInput.value;

    if (!time) {
      showToast("Selecciona una hora disponible para continuar.");
      return;
    }

    const { error } = await db.from("appointments").insert({
      user_id: user.id,
      name,
      phone,
      date,
      time,
      service: "Corte",
      price: SERVICE_PRICE
    });

    if (error) {
      if (error.code === "23505") {
        showToast("Ese horario acaba de ocuparse. Elige otro.");
        await renderSlots();
        return;
      }

      showToast("No se pudo confirmar la cita. Revisa la conexion.");
      console.error(error);
      return;
    }

    localStorage.setItem("currentUser", JSON.stringify({
      ...user,
      name,
      phone,
      role: "client"
    }));

    form.reset();
    dateInput.value = date;
    document.getElementById("clientName").value = name;
    document.getElementById("clientPhone").value = phone;
    await renderSlots();
    showToast("Cita confirmada. Te esperamos en JMbarber.");
  });
}

if (form) {
  initBooking();
}
