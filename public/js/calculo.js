/**
 * Cálculo de cobro por tiempo de parqueo y utilidades de formato.
 * Funciones puras (sin IndexedDB) para poder probarlas de forma aislada
 * y reutilizarlas desde app.js al entregar una moto.
 */

/**
 * Calcula el valor a cobrar entre hora_ingreso y hora_salida según la
 * tarifa vigente: minutos de gracia sin costo, luego horas completas a
 * valor_hora y una fracción final (menos de una hora) a valor_fraccion.
 */
function calcularCobro(horaIngresoIso, horaSalidaIso, tarifa) {
  const ingreso = new Date(horaIngresoIso);
  const salida = new Date(horaSalidaIso);
  const minutosTotales = Math.max(0, Math.ceil((salida - ingreso) / 60000));
  const minutosCobrables = Math.max(0, minutosTotales - tarifa.minutos_gracia);

  const horas = Math.floor(minutosCobrables / 60);
  const minutosFraccion = minutosCobrables % 60;

  let valor = horas * tarifa.valor_hora;
  if (minutosFraccion > 0) {
    valor += tarifa.valor_fraccion;
  }

  return { valor, minutosTotales, minutosCobrables, horas, minutosFraccion };
}

function formatDuracion(minutosTotales) {
  const h = Math.floor(minutosTotales / 60);
  const m = minutosTotales % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function formatMoneda(valor) {
  return '$' + Math.round(valor).toLocaleString('es-CO');
}

window.ParqueaderoCalculo = {
  calcularCobro,
  formatDuracion,
  formatMoneda,
};
