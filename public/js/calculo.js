/**
 * Cálculo de cobro por tiempo de parqueo y utilidades de formato.
 * Funciones puras (sin IndexedDB) para poder probarlas de forma aislada
 * y reutilizarlas desde app.js al entregar una moto.
 */

/**
 * Calcula el valor a cobrar entre hora_ingreso y hora_salida.
 * Tarifa plana: se cobra siempre tarifa.valor_hora completo, sin importar
 * cuánto tiempo haya estado la moto (desde el minuto 1 ya se debe el
 * valor completo). minutosTotales se conserva solo para mostrar la
 * duración en pantalla y en el SMS, no afecta el valor.
 */
function calcularCobro(horaIngresoIso, horaSalidaIso, tarifa) {
  const ingreso = new Date(horaIngresoIso);
  const salida = new Date(horaSalidaIso);
  const minutosTotales = Math.max(0, Math.ceil((salida - ingreso) / 60000));

  return { valor: tarifa.valor_hora, minutosTotales, minutosCobrables: minutosTotales, horas: 0, minutosFraccion: 0 };
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
