const BARBER_DEFAULT = {
  phone: "3014300748",
  password: "2602"
};

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authMessage = document.getElementById("authMessage");
const authTabs = document.querySelectorAll("[data-auth-tab]");
const authPanels = document.querySelectorAll("[data-auth-panel]");

function normalizePhone(value) {
  return value.replace(/\D/g, "");
}

async function hashPassword(password) {
  if (!crypto.subtle) {
    let hash = 0;
    for (let index = 0; index < password.length; index += 1) {
      hash = (hash << 5) - hash + password.charCodeAt(index);
      hash |= 0;
    }
    return `fallback-${Math.abs(hash)}`;
  }

  const bytes = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function showMessage(message, type = "warning") {
  authMessage.textContent = message;
  authMessage.classList.remove("hidden", "success");
  if (type === "success") authMessage.classList.add("success");
}

function databaseErrorMessage(error, fallback) {
  if (error?.message?.includes("row-level security")) {
    return "Supabase esta bloqueando el registro por RLS. Ejecuta de nuevo el SQL actualizado.";
  }

  if (error?.code === "23505") {
    return "Ese celular ya esta registrado.";
  }

  return fallback;
}

function setActiveTab(tabName) {
  authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authTab === tabName);
  });

  authPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.authPanel === tabName);
  });

  authMessage.classList.add("hidden");
}

function goToBooking(user) {
  localStorage.setItem("currentUser", JSON.stringify({
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: "client",
    status: user.status
  }));
  window.location.href = "booking.html";
}

async function findUserByPhone(phone) {
  const { data, error } = await db
    .from("client_users")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.authTab));
});

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const phone = normalizePhone(document.getElementById("phone").value);
    const password = document.getElementById("password").value.trim();

    if (phone === BARBER_DEFAULT.phone && password === BARBER_DEFAULT.password) {
      localStorage.setItem("currentUser", JSON.stringify({ phone, role: "barber" }));
      window.location.href = "admin.html";
      return;
    }

    try {
      const user = await findUserByPhone(phone);

      if (!user) {
        setActiveTab("register");
        document.getElementById("registerPhone").value = phone;
        showMessage("Ese celular no esta registrado. Completa el registro para agendar.");
        return;
      }

      const passwordHash = await hashPassword(password);

      if (user.password_hash !== passwordHash) {
        showMessage("La contrasena no coincide con ese celular.");
        return;
      }

      if (user.status === "rejected") {
        showMessage("Tu registro fue rechazado. Comunicate con el barbero para mas informacion.");
        return;
      }

      goToBooking(user);
    } catch (error) {
      console.error(error);
      showMessage(databaseErrorMessage(error, "No se pudo conectar con la base de datos. Revisa Supabase y el SQL."));
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("registerName").value.trim();
    const phone = normalizePhone(document.getElementById("registerPhone").value);
    const password = document.getElementById("registerPassword").value.trim();

    if (phone.length < 7) {
      showMessage("Escribe un numero de celular valido.");
      return;
    }

    if (phone === BARBER_DEFAULT.phone) {
      showMessage("Ese celular esta reservado para el barbero.");
      return;
    }

    try {
      const existingUser = await findUserByPhone(phone);

      if (existingUser) {
        setActiveTab("login");
        document.getElementById("phone").value = phone;

        if (existingUser.status === "pending") {
          showMessage("Ese celular ya esta registrado. Entra con tu contrasena para continuar.");
          return;
        }

        if (existingUser.status === "rejected") {
          showMessage("Ese celular ya fue revisado y rechazado. Comunicate con el barbero.");
          return;
        }

        showMessage("Ese celular ya esta registrado. Entra con tu contrasena.");
        return;
      }

      const passwordHash = await hashPassword(password);
      const { data: newUser, error } = await db
        .from("client_users")
        .insert({
          name,
          phone,
          password_hash: passwordHash,
          status: "pending"
        })
        .select()
        .single();

      if (error) throw error;

      registerForm.reset();
      goToBooking(newUser);
    } catch (error) {
      console.error(error);
      showMessage(databaseErrorMessage(error, "No se pudo guardar el registro. Revisa la tabla client_users en Supabase."));
    }
  });
}
