/**
 * Cálculo de duración de parqueo y utilidades de formato. El sistema no
 * maneja dinero: no calcula ni muestra ningún valor a cobrar, el pago se
 * gestiona personalmente fuera de la app. Función pura (sin IndexedDB)
 * para poder probarla de forma aislada y reutilizarla desde app.js al
 * entregar una moto.
 */

/** Minutos transcurridos entre hora_ingreso y hora_salida. */
function calcularDuracion(horaIngresoIso, horaSalidaIso) {
  const ingreso = new Date(horaIngresoIso);
  const salida = new Date(horaSalidaIso);
  const minutosTotales = Math.max(0, Math.ceil((salida - ingreso) / 60000));
  return { minutosTotales };
}

function formatDuracion(minutosTotales) {
  const h = Math.floor(minutosTotales / 60);
  const m = minutosTotales % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

window.ParqueaderoCalculo = {
  calcularDuracion,
  formatDuracion,
};
