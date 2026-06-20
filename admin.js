const calendarGrid = document.getElementById("calendarGrid");
const monthTitle = document.getElementById("monthTitle");
const todayCount = document.getElementById("todayCount");
const monthCount = document.getElementById("monthCount");
const pendingCount = document.getElementById("pendingCount");
const pendingPill = document.getElementById("pendingPill");
const vipCount = document.getElementById("vipCount");
const registrationRequests = document.getElementById("registrationRequests");
const vipList = document.getElementById("vipList");
const modal = document.getElementById("dayModal");
const modalDate = document.getElementById("modalDate");
const modalSubtitle = document.getElementById("modalSubtitle");
const dayAppointments = document.getElementById("dayAppointments");
const closeModal = document.getElementById("closeModal");
const editScheduleBtn = document.getElementById("editScheduleBtn");
const scheduleModal = document.getElementById("scheduleModal");
const scheduleModalDate = document.getElementById("scheduleModalDate");
const scheduleHoursGrid = document.getElementById("scheduleHoursGrid");
const closeScheduleModal = document.getElementById("closeScheduleModal");
const saveScheduleBtn = document.getElementById("saveScheduleBtn");
const dayOffToggle = document.getElementById("dayOffToggle");
const scheduleEditorNote = document.getElementById("scheduleEditorNote");
const vipModal = document.getElementById("vipModal");
const vipModalTitle = document.getElementById("vipModalTitle");
const vipForm = document.getElementById("vipForm");
const vipEditId = document.getElementById("vipEditId");
const vipClient = document.getElementById("vipClient");
const vipDay = document.getElementById("vipDay");
const vipTime = document.getElementById("vipTime");
const vipFrequency = document.getElementById("vipFrequency");
const openVipForm = document.getElementById("openVipForm");
const closeVipModal = document.getElementById("closeVipModal");
const prevMonth = document.getElementById("prevMonth");
const nextMonth = document.getElementById("nextMonth");
const logoutBtn = document.getElementById("logoutBtn");
const toast = document.getElementById("toast");

let visibleMonth = new Date();
visibleMonth.setDate(1);
let activeDateKey = "";
let cachedVipSchedules = [];
let cachedVipExceptions = [];
let scheduleDraft = new Set();
let scheduleDayClosed = false;

function requireBarber() {
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  if (currentUser.role !== "barber") {
    window.location.href = "loguin.html";
    return false;
  }
  return true;
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

async function loadUsers() {
  const { data, error } = await db
    .from("client_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

async function refreshVipCache() {
  const data = await loadVipData();
  cachedVipSchedules = data.vipSchedules;
  cachedVipExceptions = data.vipExceptions;
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
  vipCount.textContent = cachedVipSchedules.length;
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
  showToast(status === "approved" ? "Cliente aprobado." : "Registro rechazado.");
}

function populateVipTimeSelect() {
  vipTime.innerHTML = defaultTimesRange()
    .map((time) => `<option value="${time}">${timeLabel(time)}</option>`)
    .join("");
}

async function populateVipClientSelect(selectedId = "") {
  const users = (await loadUsers()).filter((user) => user.status !== "rejected");
  vipClient.innerHTML = users
    .map((user) => `<option value="${user.id}" data-name="${user.name}" data-phone="${user.phone}">${user.name} (${user.phone})</option>`)
    .join("");

  if (selectedId) vipClient.value = selectedId;
}

async function renderVipList() {
  vipList.innerHTML = "";

  if (cachedVipSchedules.length === 0) {
    vipList.innerHTML = `<div class="empty">No hay clientes VIP configurados.</div>`;
    return;
  }

  cachedVipSchedules.forEach((vip) => {
    const item = document.createElement("div");
    item.className = "request-item";
    item.innerHTML = `
      <div>
        <strong>${vip.name} <span class="pill vip-pill">VIP</span></strong>
        <div class="muted small">${vip.phone} - ${WEEKDAY_NAMES[vip.day_of_week]} ${timeLabel(vip.time)} - ${frequencyLabel(vip.frequency)}</div>
      </div>
      <div class="request-actions">
        <button class="btn secondary" type="button" data-action="edit">Editar</button>
        <button class="btn danger" type="button" data-action="delete">Eliminar</button>
      </div>
    `;

    item.querySelector('[data-action="edit"]').addEventListener("click", () => openVipEditor(vip));
    item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteVip(vip.id));
    vipList.appendChild(item);
  });
}

function openVipEditor(vip = null) {
  populateVipClientSelect(vip?.user_id || "");
  vipEditId.value = vip?.id || "";
  vipModalTitle.textContent = vip ? "Editar VIP" : "Agregar VIP";
  vipDay.value = String(vip?.day_of_week ?? 6);
  vipTime.value = vip?.time || "16:00";
  vipFrequency.value = vip?.frequency || "weekly";
  vipClient.disabled = Boolean(vip);
  vipModal.classList.remove("hidden");
}

async function deleteVip(vipId) {
  const { error } = await db.from("vip_schedules").update({ active: false }).eq("id", vipId);
  if (error) {
    showToast("No se pudo eliminar el VIP.");
    console.error(error);
    return;
  }

  await refreshVipCache();
  await renderVipList();
  await renderCalendar();
  if (activeDateKey) await openDay(activeDateKey);
  showToast("Cliente VIP eliminado.");
}

async function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 41);

  monthTitle.textContent = `${MONTH_NAMES[month]} ${year}`;
  calendarGrid.innerHTML = `<div class="empty">Cargando calendario...</div>`;

  let slotsByDate = {};
  try {
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const dateKey = toDateKey(date);
      slotsByDate[dateKey] = await buildDaySlots(dateKey, cachedVipSchedules, cachedVipExceptions);
    }
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
    const daySlotsData = slotsByDate[dateKey] || [];
    const summary = summarizeDaySlots(daySlotsData);
    const isCurrentMonth = date.getMonth() === month;
    const isToday = dateKey === toDateKey(new Date());

    let statusLabel = "Libre";
    let dayClass = "day-available";

    if (summary.closed) {
      statusLabel = "Cerrado";
      dayClass = "day-closed";
    } else if (summary.full) {
      statusLabel = "Lleno";
      dayClass = "day-full";
    } else if (summary.freeCount < summary.totalCount) {
      statusLabel = `${summary.freeCount} libres`;
      dayClass = "day-partial";
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `day${isCurrentMonth ? "" : " outside"}${isToday ? " today" : ""} ${dayClass}`;
    button.innerHTML = `
      <span class="day-number">${date.getDate()}</span>
      <span class="day-meta">
        <span>${statusLabel}</span>
        ${summary.closed || summary.full || summary.freeCount < summary.totalCount ? '<span class="dot"></span>' : ""}
      </span>
    `;
    button.addEventListener("click", () => openDay(dateKey));
    calendarGrid.appendChild(button);
  }

  let appointments = [];
  try {
    appointments = await loadAppointmentsBetween(toDateKey(start), toDateKey(end));
  } catch (error) {
    console.error(error);
  }

  await updateMetrics(appointments.filter((appointment) => makeLocalDate(appointment.date).getMonth() === month));
}

async function openDay(dateKey) {
  activeDateKey = dateKey;
  let slots = [];
  const closed = await isDayClosed(dateKey);

  try {
    slots = await buildDaySlots(dateKey, cachedVipSchedules, cachedVipExceptions);
  } catch (error) {
    showToast("No se pudieron cargar las citas del dia.");
    console.error(error);
    return;
  }

  const summary = summarizeDaySlots(slots);
  modalDate.textContent = prettyDate(dateKey);
  modalSubtitle.textContent = closed
    ? "Este dia esta marcado como dia de descanso. No hay horarios disponibles."
    : summary.full
      ? `Dia completo: las ${summary.totalCount} horas estan ocupadas o bloqueadas.`
      : `${summary.totalCount - summary.freeCount} hora${summary.totalCount - summary.freeCount === 1 ? "" : "s"} ocupada${summary.totalCount - summary.freeCount === 1 ? "" : "s"} de ${summary.totalCount} en el horario del dia`;
  dayAppointments.innerHTML = "";

  if (closed) {
    dayAppointments.innerHTML = `<div class="empty">Dia de descanso. Puedes habilitarlo desde "Editar horario".</div>`;
    modal.classList.remove("hidden");
    return;
  }

  slots.forEach((slot) => {
    const row = document.createElement("div");
    row.className = `time-row${slot.status !== "free" ? " busy" : ""}`;

    if (slot.status === "booked") {
      row.innerHTML = `
        <strong>${timeLabel(slot.time)}</strong>
        <div>
          <strong>${slot.appointment.name}</strong>
          <div class="muted small">${slot.appointment.phone} - Corte - $16.000</div>
        </div>
        <button class="btn danger" type="button">Eliminar</button>
      `;
      row.querySelector("button").addEventListener("click", () => deleteAppointment(slot.appointment.id, dateKey));
    } else if (slot.status === "vip") {
      row.innerHTML = `
        <strong>${timeLabel(slot.time)}</strong>
        <div>
          <strong>${slot.vip.vip.name} <span class="pill vip-pill">VIP</span></strong>
          <div class="muted small">${slot.vip.vip.phone} - Horario fijo${slot.vip.isRescheduledTo ? " (reagendado)" : ""}</div>
        </div>
        <span class="pill">VIP</span>
      `;
    } else if (slot.status === "blocked") {
      row.innerHTML = `
        <strong>${timeLabel(slot.time)}</strong>
        <div class="muted">Bloqueado manualmente</div>
        <button class="btn secondary" type="button">Desbloquear</button>
      `;
      row.querySelector("button").addEventListener("click", () => unblockSlot(dateKey, slot.time));
    } else {
      row.innerHTML = `
        <strong>${timeLabel(slot.time)}</strong>
        <div class="muted">Horario libre</div>
        <button class="btn secondary" type="button">Bloquear</button>
      `;
      row.querySelector("button").addEventListener("click", () => blockSlot(dateKey, slot.time));
    }

    dayAppointments.appendChild(row);
  });

  modal.classList.remove("hidden");
}

async function blockSlot(dateKey, time) {
  const { error } = await db.from("blocked_slots").insert({ date: dateKey, time });
  if (error) {
    showToast("No se pudo bloquear la hora.");
    console.error(error);
    return;
  }
  await renderCalendar();
  await openDay(dateKey);
  showToast("Hora bloqueada.");
}

async function unblockSlot(dateKey, time) {
  const { error } = await db.from("blocked_slots").delete().eq("date", dateKey).eq("time", time);
  if (error) {
    showToast("No se pudo desbloquear la hora.");
    console.error(error);
    return;
  }
  await renderCalendar();
  await openDay(dateKey);
  showToast("Hora desbloqueada.");
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

async function openScheduleEditor(dateKey) {
  activeDateKey = dateKey;
  const record = await loadDayScheduleRecord(dateKey);
  scheduleDayClosed = Boolean(record?.closed);
  scheduleDraft = new Set(scheduleDayClosed ? [] : (record?.hours?.length ? record.hours : defaultTimesRange()));
  scheduleModalDate.textContent = prettyDate(dateKey);
  scheduleHoursGrid.innerHTML = "";

  if (dayOffToggle) {
    dayOffToggle.checked = scheduleDayClosed;
  }
  updateScheduleEditorState();

  defaultTimesRange().forEach((time) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.time = time;
    button.className = `slot schedule-hour${scheduleDraft.has(time) ? " selected" : ""}`;
    button.textContent = timeLabel(time);
    button.addEventListener("click", () => {
      if (scheduleDayClosed) return;
      if (scheduleDraft.has(time)) scheduleDraft.delete(time);
      else scheduleDraft.add(time);
      button.classList.toggle("selected", scheduleDraft.has(time));
    });
    scheduleHoursGrid.appendChild(button);
  });

  scheduleModal.classList.remove("hidden");
}

function updateScheduleEditorState() {
  const hourButtons = scheduleHoursGrid.querySelectorAll(".schedule-hour");
  hourButtons.forEach((button) => {
    button.disabled = scheduleDayClosed;
    button.classList.toggle("disabled", scheduleDayClosed);
  });

  if (scheduleEditorNote) {
    scheduleEditorNote.textContent = scheduleDayClosed
      ? "Este dia quedara cerrado para clientes. Puedes volver a habilitarlo cuando quieras."
      : "Marca las horas en las que trabajaras este dia.";
  }
}

async function saveDaySchedule() {
  if (!activeDateKey) return;

  if (scheduleDayClosed) {
    const { error } = await db.from("day_schedules").upsert({
      date: activeDateKey,
      hours: [],
      closed: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "date" });

    if (error) {
      showToast("No se pudo marcar el dia como cerrado.");
      console.error(error);
      return;
    }

    scheduleModal.classList.add("hidden");
    await renderCalendar();
    await openDay(activeDateKey);
    showToast("Dia marcado como descanso.");
    return;
  }

  const hours = [...scheduleDraft].sort();
  if (hours.length === 0) {
    showToast("Selecciona al menos una hora de trabajo o marca el dia como descanso.");
    return;
  }

  const { error } = await db.from("day_schedules").upsert({
    date: activeDateKey,
    hours,
    closed: false,
    updated_at: new Date().toISOString()
  }, { onConflict: "date" });

  if (error) {
    showToast("No se pudo guardar el horario.");
    console.error(error);
    return;
  }

  scheduleModal.classList.add("hidden");
  await renderCalendar();
  await openDay(activeDateKey);
  showToast("Horario del dia actualizado.");
}

async function initAdmin() {
  if (!requireBarber()) return;

  populateVipTimeSelect();
  await refreshVipCache();
  await renderCalendar();
  await renderRegistrationRequests();
  await renderVipList();
  await initPushForBarber();

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

  editScheduleBtn.addEventListener("click", () => {
    if (activeDateKey) openScheduleEditor(activeDateKey);
  });

  closeScheduleModal.addEventListener("click", () => scheduleModal.classList.add("hidden"));
  scheduleModal.addEventListener("click", (event) => {
    if (event.target === scheduleModal) scheduleModal.classList.add("hidden");
  });
  saveScheduleBtn.addEventListener("click", saveDaySchedule);

  dayOffToggle?.addEventListener("change", () => {
    scheduleDayClosed = dayOffToggle.checked;
    if (scheduleDayClosed) scheduleDraft.clear();
    else if (scheduleDraft.size === 0) defaultTimesRange().forEach((time) => scheduleDraft.add(time));
    updateScheduleEditorState();
    scheduleHoursGrid.querySelectorAll(".schedule-hour").forEach((button) => {
      const time = button.dataset.time;
      if (time) button.classList.toggle("selected", scheduleDraft.has(time));
    });
  });

  openVipForm.addEventListener("click", () => openVipEditor());
  closeVipModal.addEventListener("click", () => vipModal.classList.add("hidden"));
  vipModal.addEventListener("click", (event) => {
    if (event.target === vipModal) vipModal.classList.add("hidden");
  });

  vipForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedOption = vipClient.selectedOptions[0];
    const payload = {
      user_id: vipClient.value,
      name: selectedOption.dataset.name,
      phone: selectedOption.dataset.phone,
      day_of_week: Number(vipDay.value),
      time: vipTime.value,
      frequency: vipFrequency.value,
      active: true,
      start_date: toDateKey(new Date())
    };

    const editId = vipEditId.value;
    const query = editId
      ? db.from("vip_schedules").update(payload).eq("id", editId)
      : db.from("vip_schedules").insert(payload);

    const { error } = await query;
    if (error) {
      showToast("No se pudo guardar el cliente VIP.");
      console.error(error);
      return;
    }

    vipModal.classList.add("hidden");
    vipForm.reset();
    vipClient.disabled = false;
    await refreshVipCache();
    await renderVipList();
    await renderCalendar();
    showToast(editId ? "VIP actualizado." : "Cliente VIP agregado.");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      modal.classList.add("hidden");
      scheduleModal.classList.add("hidden");
      vipModal.classList.add("hidden");
    }
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
  });
}

initAdmin();
