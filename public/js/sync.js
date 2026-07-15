/**
 * Motor de sincronización bidireccional:
 * - SUBE en lote los cambios PENDIENTE de IndexedDB a la API PHP
 *   (POST /api/sync) cuando hay conexión, y marca como SINCRONIZADO lo
 *   que el servidor confirme.
 * - DESCARGA (GET /api/sync) lo que hayan registrado OTROS dispositivos
 *   con la misma cuenta desde la última descarga, para que todos los
 *   dispositivos terminen viendo el mismo estado (motos parqueadas,
 *   historial, etc.), no solo lo que cada uno registró localmente.
 * Nunca bloquea la operación local: si falla, todo queda igual y se
 * reintenta más tarde.
 */

const SYNC_URL = new URL('../api/sync', window.location.href).toString();
const INTERVALO_SYNC_MS = 20000;
const ULTIMA_DESCARGA_KEY = 'parqueadero_ultima_descarga';

let sincronizando = false;

async function recolectarPendientes() {
  const [propietarios, motos, registros, notificaciones] = await Promise.all([
    ParqueaderoDB.getPendientes('propietarios'),
    ParqueaderoDB.getPendientes('motos'),
    ParqueaderoDB.getPendientes('registros'),
    ParqueaderoDB.getPendientes('notificaciones'),
  ]);
  return { propietarios, motos, registros, notificaciones };
}

function totalPendientes(lote) {
  return lote.propietarios.length + lote.motos.length + lote.registros.length + lote.notificaciones.length;
}

async function aplicarResultado(storeName, items) {
  for (const item of items) {
    if (item.status === 'ok' && item.id) {
      await ParqueaderoDB.marcarSincronizado(storeName, item.id);
    } else if (item.status !== 'ok') {
      console.warn(`[sync] No se pudo sincronizar ${storeName} ${item.id}: ${item.message || 'error desconocido'}`);
    }
  }
}

async function subirPendientes() {
  const lote = await recolectarPendientes();
  if (totalPendientes(lote) === 0) return;

  const respuesta = await fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lote),
  });

  if (!respuesta.ok) {
    throw new Error('El servidor respondió con error ' + respuesta.status);
  }

  const cuerpo = await respuesta.json();
  if (!cuerpo.ok) {
    throw new Error(cuerpo.error || 'Sincronización rechazada por el servidor.');
  }

  await Promise.all([
    aplicarResultado('propietarios', cuerpo.resultado.propietarios || []),
    aplicarResultado('motos', cuerpo.resultado.motos || []),
    aplicarResultado('registros', cuerpo.resultado.registros || []),
    aplicarResultado('notificaciones', cuerpo.resultado.notificaciones || []),
  ]);
}

/**
 * Trae lo que otros dispositivos hayan registrado desde la última
 * descarga (o todo, la primera vez) y lo aplica al espejo local.
 * Devuelve true si llegó algo nuevo, para que la UI se pueda refrescar.
 */
async function descargarCambios() {
  const desde = localStorage.getItem(ULTIMA_DESCARGA_KEY) || '';
  const url = desde ? `${SYNC_URL}?desde=${encodeURIComponent(desde)}` : SYNC_URL;

  const respuesta = await fetch(url, { method: 'GET' });
  if (!respuesta.ok) {
    throw new Error('El servidor respondió con error ' + respuesta.status);
  }

  const cuerpo = await respuesta.json();
  if (!cuerpo.ok) {
    throw new Error(cuerpo.error || 'Descarga rechazada por el servidor.');
  }

  const totalRecibido = (cuerpo.propietarios || []).length + (cuerpo.motos || []).length
    + (cuerpo.registros || []).length + (cuerpo.notificaciones || []).length;

  await ParqueaderoDB.aplicarCambiosServidor('propietarios', cuerpo.propietarios);
  await ParqueaderoDB.aplicarCambiosServidor('motos', cuerpo.motos);
  await ParqueaderoDB.aplicarCambiosServidor('registros', cuerpo.registros);
  await ParqueaderoDB.aplicarCambiosServidor('notificaciones', cuerpo.notificaciones);

  if (cuerpo.servidorHora) {
    localStorage.setItem(ULTIMA_DESCARGA_KEY, cuerpo.servidorHora);
  }

  return totalRecibido > 0;
}

async function sincronizarAhora() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;

  try {
    await subirPendientes();
    const llegoAlgoNuevo = await descargarCambios();
    if (llegoAlgoNuevo) {
      window.dispatchEvent(new CustomEvent('parqueadero:datos-actualizados'));
    }
  } catch (err) {
    console.warn('[sync] Sincronización falló, se reintentará más tarde:', err.message);
  } finally {
    sincronizando = false;
    await actualizarContadorPendientes();
  }
}

async function actualizarContadorPendientes() {
  const el = document.getElementById('chip-pendientes');
  if (!el) return;
  const lote = await recolectarPendientes();
  const total = totalPendientes(lote);
  el.textContent = total > 0 ? `${total} por sincronizar` : '';
}

window.ParqueaderoSync = {
  sincronizarAhora,
  actualizarContadorPendientes,
};

window.addEventListener('online', sincronizarAhora);
setInterval(sincronizarAhora, INTERVALO_SYNC_MS);

document.addEventListener('DOMContentLoaded', () => {
  actualizarContadorPendientes();
  if (navigator.onLine) {
    sincronizarAhora();
  }
});
