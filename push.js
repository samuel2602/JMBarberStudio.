const ONESIGNAL_APP_ID = "13bbacae-185b-49d5-b113-d1d7499d6503";

function setPushStatus(message, isError = false) {
  const statusEl = document.getElementById("pushStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f0a89a" : "";
}

async function savePushSubscription({ userId = null, phone, role, playerId }) {
  if (!playerId || !phone) return false;

  const { error } = await db.from("push_subscriptions").upsert({
    user_id: userId,
    phone,
    role,
    player_id: playerId,
    updated_at: new Date().toISOString()
  }, { onConflict: "player_id" });

  if (error) {
    console.error("No se pudo guardar la suscripcion push.", error);
    return false;
  }

  return true;
}

async function registerPushSubscription(user, role) {
  if (!ONESIGNAL_APP_ID) {
    setPushStatus("Configura ONESIGNAL_APP_ID en push.js y despliega la Edge Function.", true);
    return false;
  }

  if (!window.OneSignalDeferred) {
    setPushStatus("OneSignal aun no cargo. Recarga la pagina e intenta de nuevo.", true);
    return false;
  }

  return new Promise((resolve) => {
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        notifyButton: { enable: false },
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: "OneSignalSDKWorker.js", 
        serviceWorkerParam: { scope: "/JMbBarbersStudio/" } 
      });

        const permission = await OneSignal.Notifications.requestPermission();
        if (!permission) {
          setPushStatus("Permiso denegado. Activa notificaciones en ajustes del navegador.", true);
          resolve(false);
          return;
        }

        const playerId = OneSignal.User.PushSubscription.id;
        if (!playerId) {
          setPushStatus("No se pudo obtener el ID de notificacion. Intenta de nuevo.", true);
          resolve(false);
          return;
        }

        const saved = await savePushSubscription({
          userId: user?.id || null,
          phone: user.phone,
          role,
          playerId
        });

        if (!saved) {
          setPushStatus("No se pudo registrar tu dispositivo.", true);
          resolve(false);
          return;
        }

        setPushStatus("Notificaciones activadas en este dispositivo.");
        resolve(true);
      } catch (error) {
        console.error(error);
        setPushStatus("Error al activar notificaciones.", true);
        resolve(false);
      }
    });
  });
}

async function initPushForCurrentUser(user, role) {
  const button = document.getElementById("enablePushBtn");
  if (!button || !user?.phone) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    await registerPushSubscription(user, role);
    button.disabled = false;
  });

  if (!ONESIGNAL_APP_ID) {
    setPushStatus("Pendiente: crea app gratis en OneSignal y pega el App ID en push.js.");
  }
}

async function initPushForBarber() {
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  if (currentUser.role !== "barber") return;

  await initPushForCurrentUser(
    { phone: STUDIO.BARBER_PHONE, id: null },
    "barber"
  );
}
