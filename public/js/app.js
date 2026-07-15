/**
 * UI de la PWA: navegación entre vistas, estado de conexión, el
 * formulario de registro de aparcamiento (RF1, con OCR de placas), el
 * buscador y la entrega de motos (RF2/RF3), y el historial (RF4).
 */

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatFechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------
// Estado de conexión
// ---------------------------------------------------------------------

function actualizarChipConexion() {
  const chip = document.getElementById('chip-conexion');
  const texto = document.getElementById('chip-conexion-texto');
  if (navigator.onLine) {
    chip.classList.add('conectado');
    texto.textContent = 'Conectado';
  } else {
    chip.classList.remove('conectado');
    texto.textContent = 'Sin conexión';
  }
}

window.addEventListener('online', actualizarChipConexion);
window.addEventListener('offline', actualizarChipConexion);

// ---------------------------------------------------------------------
// Navegación por pestañas (sidebar en PC + barra inferior en móvil)
// ---------------------------------------------------------------------

function inicializarNavegacion() {
  const botones = document.querySelectorAll('.tab-btn');
  botones.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Hay dos copias físicas de cada pestaña (sidebar y barra inferior):
      // se sincroniza el estado "activo" por data-vista, no por el botón
      // exacto que se clickeó.
      botones.forEach((b) => b.classList.toggle('activo', b.dataset.vista === btn.dataset.vista));

      document.querySelectorAll('.vista').forEach((v) => v.classList.remove('activa'));
      const vista = document.getElementById(`vista-${btn.dataset.vista}`);
      if (vista) vista.classList.add('activa');

      if (btn.dataset.vista === 'historial') {
        refrescarHistorial();
      }
      if (btn.dataset.vista === 'parqueados') {
        refrescarListaEnParqueadero();
      }
    });
  });
}

// ---------------------------------------------------------------------
// Formulario de registro
// ---------------------------------------------------------------------

const form = {
  el: null,
  cedula: null,
  nombre: null,
  telefono: null,
  placa: null,
  marca: null,
  color: null,
  descripcion: null,
  mensaje: null,
};

let modoPlacaActual = 'foto';
let streamCamara = null;

function inicializarFormulario() {
  form.el = document.getElementById('form-registro');
  form.cedula = document.getElementById('input-cedula');
  form.nombre = document.getElementById('input-nombre');
  form.telefono = document.getElementById('input-telefono');
  form.placa = document.getElementById('input-placa');
  form.marca = document.getElementById('input-marca');
  form.color = document.getElementById('input-color');
  form.descripcion = document.getElementById('input-descripcion');
  form.mensaje = document.getElementById('form-registro-mensaje');

  document.getElementById('btn-cancelar-registro').addEventListener('click', resetearFormulario);

  form.cedula.addEventListener('blur', autocompletarPropietario);

  form.descripcion.addEventListener('input', () => {
    document.getElementById('contador-descripcion').textContent = form.descripcion.value.length;
  });

  form.placa.addEventListener('input', () => {
    form.placa.value = form.placa.value.toUpperCase();
  });
  form.placa.addEventListener('blur', autocompletarMoto);

  inicializarSelectorPlaca();
  inicializarCamara();

  form.el.addEventListener('submit', manejarSubmitRegistro);
}

// El formulario se muestra siempre (no hay botón que lo revele): esta
// función solo lo deja limpio y listo para el siguiente registro.
function resetearFormulario() {
  detenerCamaraSiActiva();
  form.el.reset();
  document.getElementById('contador-descripcion').textContent = '0';
  form.mensaje.innerHTML = '';
  document.getElementById('confirmacion-registro').classList.add('oculto');
}

async function autocompletarPropietario() {
  const cedula = form.cedula.value.trim();
  if (!cedula) return;

  const propietario = await ParqueaderoDB.getPropietario(cedula);
  if (propietario) {
    form.nombre.value = propietario.nombre;
    form.telefono.value = propietario.telefono;
  }
}

/**
 * Si la placa ya pertenece a una moto conocida (p. ej. una moto que ya
 * había salido y ahora vuelve), se autocompletan sus datos y los del
 * propietario, para no tener que volver a llenar todo el formulario
 * desde cero cada vez que regresa.
 */
async function autocompletarMoto() {
  if (modoPlacaActual === 'sin-placa') return;

  const placa = form.placa.value.trim().toUpperCase();
  if (!placa) return;

  const moto = await ParqueaderoDB.getMotoPorPlaca(placa);
  if (!moto) return;

  form.marca.value = moto.marca || '';
  form.color.value = moto.color || '';
  form.descripcion.value = moto.descripcion || '';
  document.getElementById('contador-descripcion').textContent = form.descripcion.value.length;

  form.cedula.value = moto.cedula_propietario;
  await autocompletarPropietario();

  const registroActivo = await ParqueaderoDB.getRegistroActivoPorMoto(moto.id);
  if (registroActivo) {
    mostrarMensajeForm('Esta moto ya figura como parqueada actualmente. Revisa antes de registrar otro ingreso.', 'error');
  } else {
    mostrarMensajeForm('Esta moto ya estaba registrada: se autocompletaron sus datos.', 'exito');
  }
}

// -------------------- Selector de modo de placa --------------------

function inicializarSelectorPlaca() {
  const botones = document.querySelectorAll('#selector-modo-placa button');
  botones.forEach((btn) => {
    btn.addEventListener('click', () => {
      botones.forEach((b) => b.classList.remove('activo'));
      btn.classList.add('activo');

      document.querySelectorAll('.modo-placa-panel').forEach((p) => p.classList.remove('activa'));
      document.querySelector(`.modo-placa-panel[data-panel="${btn.dataset.modo}"]`).classList.add('activa');

      modoPlacaActual = btn.dataset.modo;

      if (modoPlacaActual === 'sin-placa') {
        form.placa.value = '';
        form.placa.disabled = true;
        detenerCamaraSiActiva();
      } else {
        form.placa.disabled = false;
      }

      if (modoPlacaActual !== 'foto') {
        detenerCamaraSiActiva();
      }
    });
  });
}

// -------------------- Cámara + OCR --------------------

function inicializarCamara() {
  const btnAbrir = document.getElementById('btn-abrir-camara');
  const btnCapturar = document.getElementById('btn-capturar');
  const video = document.getElementById('video-camara');
  const wrap = document.getElementById('camara-wrap');
  const estado = document.getElementById('ocr-estado');
  const instruccion = document.getElementById('camara-instruccion');

  btnAbrir.addEventListener('click', async () => {
    estado.textContent = '';
    try {
      streamCamara = await ParqueaderoOCR.iniciarCamara(video);
      wrap.classList.remove('oculto');
      btnCapturar.classList.remove('oculto');
      btnAbrir.classList.add('oculto');
      instruccion.textContent = 'Alinea la placa dentro del recuadro amarillo antes de capturar.';
    } catch (err) {
      estado.textContent = 'No se pudo abrir la cámara: ' + err.message;
    }
  });

  btnCapturar.addEventListener('click', async () => {
    estado.textContent = 'Leyendo placa...';
    try {
      const frame = ParqueaderoOCR.capturarFrame(video);
      const { placa, textoCrudo } = await ParqueaderoOCR.reconocerPlaca(frame);
      if (placa) {
        form.placa.value = placa;
        estado.textContent = `Placa detectada: ${placa} (puedes corregirla si es necesario).`;
        await autocompletarMoto();
      } else {
        estado.textContent = `No se detectó un patrón de placa válido. Texto leído: "${textoCrudo.trim()}". Corrígela manualmente.`;
      }
    } catch (err) {
      estado.textContent = 'Error al leer la placa: ' + err.message;
    } finally {
      detenerCamaraSiActiva();
      wrap.classList.add('oculto');
      btnCapturar.classList.add('oculto');
      btnAbrir.classList.remove('oculto');
      instruccion.textContent = '';
    }
  });
}

function detenerCamaraSiActiva() {
  if (streamCamara) {
    ParqueaderoOCR.detenerCamara(streamCamara);
    streamCamara = null;
  }
}

// -------------------- Envío del formulario --------------------

function mostrarMensajeForm(texto, tipo) {
  form.mensaje.innerHTML = `<div class="aviso ${tipo}">${texto}</div>`;
}

function manejarSubmitRegistro(event) {
  event.preventDefault();
  form.mensaje.innerHTML = '';
  document.getElementById('confirmacion-registro').classList.add('oculto');

  const cedula = form.cedula.value.trim();
  const nombre = form.nombre.value.trim();
  const telefono = form.telefono.value.trim();

  if (!cedula || !nombre || !telefono) {
    mostrarMensajeForm('Cédula, nombre y teléfono son obligatorios.', 'error');
    return;
  }

  // Antes de guardar nada se pregunta si el cliente ya pagó. Si dice que
  // no, el formulario se queda exactamente como está (sin borrar nada) y
  // no se registra ingreso todavía.
  document.getElementById('modal-pago').classList.remove('oculto');
}

function cerrarModalPago() {
  document.getElementById('modal-pago').classList.add('oculto');
}

function inicializarModalPago() {
  const overlay = document.getElementById('modal-pago');

  document.getElementById('btn-pago-si').addEventListener('click', confirmarPagoYRegistrar);
  document.getElementById('btn-pago-no').addEventListener('click', cerrarModalPago);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarModalPago();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('oculto')) cerrarModalPago();
  });
}

async function confirmarPagoYRegistrar() {
  cerrarModalPago();

  const cedula = form.cedula.value.trim();
  const nombre = form.nombre.value.trim();
  const telefono = form.telefono.value.trim();
  const placa = modoPlacaActual === 'sin-placa' ? null : (form.placa.value.trim().toUpperCase() || null);
  const marca = form.marca.value.trim();
  const color = form.color.value.trim();
  const descripcion = form.descripcion.value.trim();

  try {
    await ParqueaderoDB.guardarPropietario({ cedula, nombre, telefono });

    const moto = await ParqueaderoDB.guardarOReutilizarMoto({
      placa,
      marca,
      color,
      descripcion,
      cedula_propietario: cedula,
    });

    const registro = await ParqueaderoDB.crearIngreso({ motoId: moto.id });

    const hora = new Date(registro.hora_ingreso).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const placaTexto = moto.placa || 'SIN PLACA';
    const idCorto = ParqueaderoDB.shortId(registro.id);
    const mensajeSms = `Parqueadero: su moto ${placaTexto} ingresó a las ${hora}. Registro ${idCorto}.`;

    await ParqueaderoDB.encolarNotificacion({
      registroId: registro.id,
      tipo: 'INGRESO',
      telefono,
      mensaje: mensajeSms,
    });

    resetearFormulario();
    mostrarConfirmacion({ placaTexto, hora, idCorto, nombre });
    refrescarListaEnParqueadero();
    if (window.ParqueaderoSync) {
      window.ParqueaderoSync.actualizarContadorPendientes();
      window.ParqueaderoSync.sincronizarAhora();
    }
  } catch (err) {
    mostrarMensajeForm(err.message, 'error');
  }
}

function mostrarConfirmacion({ placaTexto, hora, idCorto, nombre }) {
  const el = document.getElementById('confirmacion-registro');
  el.innerHTML = `
    <div class="aviso exito">
      <strong>Registro guardado.</strong><br>
      Moto ${escapeHtml(placaTexto)} — propietario ${escapeHtml(nombre)}.<br>
      Ingreso a las ${escapeHtml(hora)}. Registro ${escapeHtml(idCorto)}.<br>
      El SMS de comprobante se enviará al sincronizar.
    </div>
  `;
  el.classList.remove('oculto');
}

// ---------------------------------------------------------------------
// Buscador + ficha de moto + entrega (RF2 / RF3)
// ---------------------------------------------------------------------

function inicializarBuscador() {
  document.getElementById('btn-buscar').addEventListener('click', ejecutarBusqueda);
  document.getElementById('input-buscar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ejecutarBusqueda();
  });
}

function renderItemBusqueda({ moto, propietario, registroActivo }) {
  const placaTexto = moto.placa || 'SIN PLACA';
  const estadoBadge = registroActivo
    ? '<span class="badge en-parqueadero">En el parqueadero</span>'
    : '<span class="badge retirada">No está parqueada</span>';

  return `
    <div class="item-lista" data-moto-id="${escapeHtml(moto.id)}">
      <div class="item-lista-cabecera">
        <span class="placa-mini">${escapeHtml(placaTexto)}</span>
        ${estadoBadge}
      </div>
      <div class="detalle">
        ${escapeHtml(moto.marca || 'Marca no registrada')} · ${escapeHtml(moto.color || 'Color no registrado')}<br>
        Propietario: ${escapeHtml(propietario.nombre)} (CC ${escapeHtml(propietario.cedula)})
      </div>
    </div>
  `;
}

async function ejecutarBusqueda() {
  const query = document.getElementById('input-buscar').value.trim();
  const mensajeEl = document.getElementById('buscar-mensaje');
  const resultadosEl = document.getElementById('buscar-resultados');
  cerrarFicha();
  mensajeEl.innerHTML = '';
  resultadosEl.innerHTML = '';

  if (!query) {
    mensajeEl.innerHTML = '<div class="aviso error">Escribe una cédula o una placa para buscar.</div>';
    return;
  }

  const resultado = await ParqueaderoDB.buscar(query);

  if (!resultado.resultados || resultado.resultados.length === 0) {
    mensajeEl.innerHTML = '<div class="aviso">No se encontraron motos con ese dato.</div>';
    return;
  }

  resultadosEl.innerHTML = resultado.resultados.map(renderItemBusqueda).join('');
  resultadosEl.querySelectorAll('.item-lista').forEach((el) => {
    el.addEventListener('click', () => abrirFicha(el.dataset.motoId));
  });

  if (resultado.resultados.length === 1) {
    abrirFicha(resultado.resultados[0].moto.id);
  }
}

/**
 * Vuelve a correr la búsqueda actual y redibuja la lista de resultados
 * (sin tocar el modal ni el mensaje de "no se encontró"). Se usa tras
 * entregar una moto para que la lista detrás del modal deje de mostrar
 * "En el parqueadero" al instante, sin tener que buscar de nuevo a mano.
 */
async function refrescarResultadosBusqueda() {
  const resultadosEl = document.getElementById('buscar-resultados');
  const query = document.getElementById('input-buscar').value.trim();
  if (!query) return;

  const resultado = await ParqueaderoDB.buscar(query);
  if (!resultado.resultados || resultado.resultados.length === 0) return;

  resultadosEl.innerHTML = resultado.resultados.map(renderItemBusqueda).join('');
  resultadosEl.querySelectorAll('.item-lista').forEach((el) => {
    el.addEventListener('click', () => abrirFicha(el.dataset.motoId));
  });
}

async function abrirFicha(motoId) {
  const moto = await ParqueaderoDB.getMoto(motoId);
  if (!moto) return;
  const propietario = await ParqueaderoDB.getPropietario(moto.cedula_propietario);
  const registroActivo = await ParqueaderoDB.getRegistroActivoPorMoto(motoId);

  const placaTexto = moto.placa || 'SIN PLACA';
  const estadoBadge = registroActivo
    ? '<span class="badge en-parqueadero">En el parqueadero</span>'
    : '<span class="badge retirada">No está parqueada</span>';

  const botonEntregar = registroActivo
    ? '<button type="button" id="btn-entregar-moto" class="boton-grande boton-verde boton-bloque mt-1">Entregar moto</button>'
    : '';

  const el = document.getElementById('ficha-moto');
  el.innerHTML = `
    <h2>Ficha de la moto</h2>
    <div class="item-lista-cabecera">
      <span class="placa-mini">${escapeHtml(placaTexto)}</span>
      ${estadoBadge}
    </div>
    <div class="ficha-linea"><strong>Marca:</strong> ${escapeHtml(moto.marca || '—')}</div>
    <div class="ficha-linea"><strong>Color:</strong> ${escapeHtml(moto.color || '—')}</div>
    <div class="ficha-linea"><strong>Descripción:</strong> ${escapeHtml(moto.descripcion || '—')}</div>
    <div class="ficha-linea"><strong>Propietario:</strong> ${escapeHtml(propietario.nombre)}</div>
    <div class="ficha-linea"><strong>Cédula:</strong> ${escapeHtml(propietario.cedula)}</div>
    <div class="ficha-linea"><strong>Teléfono:</strong> ${escapeHtml(propietario.telefono)}</div>
    ${registroActivo ? `<div class="ficha-linea"><strong>Ingreso:</strong> ${escapeHtml(formatFechaHora(registroActivo.hora_ingreso))}</div>` : ''}
    <div id="ficha-mensaje"></div>
    ${botonEntregar}
  `;
  document.getElementById('modal-ficha').classList.remove('oculto');

  if (registroActivo) {
    document.getElementById('btn-entregar-moto').addEventListener('click', () => entregarMotoUI(registroActivo.id));
  }
}

function cerrarFicha() {
  document.getElementById('modal-ficha').classList.add('oculto');
  document.getElementById('ficha-moto').innerHTML = '';
}

function inicializarModalFicha() {
  const overlay = document.getElementById('modal-ficha');

  document.getElementById('btn-cerrar-ficha').addEventListener('click', cerrarFicha);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarFicha();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('oculto')) cerrarFicha();
  });
}

async function entregarMotoUI(registroId) {
  const mensajeEl = document.getElementById('ficha-mensaje');
  const btn = document.getElementById('btn-entregar-moto');
  if (btn) btn.disabled = true;

  try {
    const registro = await ParqueaderoDB.getRegistro(registroId);
    const moto = await ParqueaderoDB.getMoto(registro.moto_id);
    const propietario = await ParqueaderoDB.getPropietario(moto.cedula_propietario);

    const horaSalida = ParqueaderoDB.nowIso();
    const { minutosTotales } = ParqueaderoCalculo.calcularDuracion(registro.hora_ingreso, horaSalida);

    // El sistema no maneja dinero: el pago se gestiona personalmente.
    await ParqueaderoDB.entregarMoto(registroId, { horaSalida, valor: null });

    const placaTexto = moto.placa || 'SIN PLACA';
    const horaTexto = new Date(horaSalida).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const duracionTexto = ParqueaderoCalculo.formatDuracion(minutosTotales);

    const mensajeSms = `Parqueadero: su moto ${placaTexto} salió a las ${horaTexto}. Tiempo: ${duracionTexto}.`;
    await ParqueaderoDB.encolarNotificacion({
      registroId,
      tipo: 'SALIDA',
      telefono: propietario.telefono,
      mensaje: mensajeSms,
    });

    mensajeEl.innerHTML = `
      <div class="aviso exito">
        <strong>Moto entregada.</strong><br>
        Tiempo: ${escapeHtml(duracionTexto)}.<br>
        El SMS de comprobante se enviará al sincronizar.
      </div>
    `;
    if (btn) btn.remove();

    refrescarListaEnParqueadero();
    refrescarResultadosBusqueda();
    if (window.ParqueaderoSync) {
      window.ParqueaderoSync.actualizarContadorPendientes();
      window.ParqueaderoSync.sincronizarAhora();
    }
  } catch (err) {
    mensajeEl.innerHTML = `<div class="aviso error">${escapeHtml(err.message)}</div>`;
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------
// Historial (RF4)
// ---------------------------------------------------------------------

function inicializarHistorial() {
  document.getElementById('historial-filtro-query').addEventListener('input', refrescarHistorial);
  document.getElementById('historial-filtro-fecha').addEventListener('input', refrescarHistorial);
  document.getElementById('btn-historial-limpiar').addEventListener('click', () => {
    document.getElementById('historial-filtro-query').value = '';
    document.getElementById('historial-filtro-fecha').value = '';
    refrescarHistorial();
  });
}

function renderFilaHistorial({ registro, moto, propietario }) {
  const placaTexto = moto ? (moto.placa || 'SIN PLACA') : '—';
  const duracionMin = Math.max(0, Math.ceil((new Date(registro.hora_salida) - new Date(registro.hora_ingreso)) / 60000));

  return `
    <div class="item-lista" style="cursor: default;">
      <div class="item-lista-cabecera">
        <span class="placa-mini">${escapeHtml(placaTexto)}</span>
        <span class="badge retirada">Retirada</span>
      </div>
      <div class="detalle">
        Propietario: ${escapeHtml(propietario ? propietario.nombre : '—')}<br>
        Ingreso: ${escapeHtml(formatFechaHora(registro.hora_ingreso))} · Salida: ${escapeHtml(formatFechaHora(registro.hora_salida))}<br>
        Duración: ${escapeHtml(ParqueaderoCalculo.formatDuracion(duracionMin))}
      </div>
    </div>
  `;
}

async function refrescarHistorial() {
  const contenedor = document.getElementById('historial-resultados');
  if (!contenedor) return;

  const query = document.getElementById('historial-filtro-query').value;
  const fecha = document.getElementById('historial-filtro-fecha').value;

  const historial = await ParqueaderoDB.getHistorial({ query, fecha });

  if (historial.length === 0) {
    contenedor.innerHTML = '<p class="ayuda">No hay aparcamientos finalizados con esos filtros.</p>';
    return;
  }

  contenedor.innerHTML = historial.map(renderFilaHistorial).join('');
}

// ---------------------------------------------------------------------
// Lista en vivo de motos en el parqueadero (columna derecha en PC)
// ---------------------------------------------------------------------

async function refrescarListaEnParqueadero() {
  const contenedor = document.getElementById('lista-en-parqueadero');
  if (!contenedor) return;

  const estadisticas = await ParqueaderoDB.getEstadisticas();
  const statEnParqueadero = document.getElementById('stat-en-parqueadero');
  const statRetiradas = document.getElementById('stat-retiradas');
  const statTotal = document.getElementById('stat-total');
  if (statEnParqueadero) statEnParqueadero.textContent = estadisticas.enParqueadero;
  if (statRetiradas) statRetiradas.textContent = estadisticas.retiradas;
  if (statTotal) statTotal.textContent = estadisticas.total;

  const items = await ParqueaderoDB.getRegistrosEnParqueadero();

  if (items.length === 0) {
    contenedor.innerHTML = '<p class="ayuda">No hay motos en el parqueadero en este momento.</p>';
    return;
  }

  contenedor.innerHTML = items.map(({ moto, propietario, registro }) => `
    <div class="item-lista" style="cursor: default;">
      <div class="item-lista-cabecera">
        <span class="placa-mini">${escapeHtml(moto ? (moto.placa || 'SIN PLACA') : '—')}</span>
        <span class="badge en-parqueadero">${escapeHtml(formatFechaHora(registro.hora_ingreso))}</span>
      </div>
      <div class="detalle">${escapeHtml(propietario ? propietario.nombre : '—')}</div>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------
// Refresco cuando llegan cambios de OTROS dispositivos (misma cuenta)
// ---------------------------------------------------------------------

function refrescarTrasSincronizar() {
  refrescarListaEnParqueadero();
  refrescarResultadosBusqueda();
  const vistaHistorial = document.getElementById('vista-historial');
  if (vistaHistorial && vistaHistorial.classList.contains('activa')) {
    refrescarHistorial();
  }
}

window.addEventListener('parqueadero:datos-actualizados', refrescarTrasSincronizar);

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  actualizarChipConexion();
  inicializarNavegacion();
  inicializarFormulario();
  inicializarModalPago();
  inicializarBuscador();
  inicializarModalFicha();
  inicializarHistorial();
  refrescarListaEnParqueadero();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('No se pudo registrar el service worker:', err);
    });
  }
});
