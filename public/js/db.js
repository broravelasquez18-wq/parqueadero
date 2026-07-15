/**
 * Capa de acceso a IndexedDB — espejo local de las tablas MySQL.
 * Toda la operación diaria del parqueadero pasa por aquí; nunca se
 * llama a la red directamente desde la UI.
 */
const DB_NAME = 'parqueadero_db';
const DB_VERSION = 2;

const STORES = {
  propietarios: 'cedula',
  motos: 'id',
  registros: 'id',
  notificaciones: 'id',
  tarifas: 'id',
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('propietarios')) {
        db.createObjectStore('propietarios', { keyPath: 'cedula' });
      }

      if (!db.objectStoreNames.contains('motos')) {
        const motos = db.createObjectStore('motos', { keyPath: 'id' });
        motos.createIndex('placa', 'placa', { unique: true });
        motos.createIndex('cedula_propietario', 'cedula_propietario', { unique: false });
      }

      if (!db.objectStoreNames.contains('registros')) {
        const registros = db.createObjectStore('registros', { keyPath: 'id' });
        registros.createIndex('moto_id', 'moto_id', { unique: false });
        registros.createIndex('estado', 'estado', { unique: false });
        registros.createIndex('sync_status', 'sync_status', { unique: false });
        registros.createIndex('moto_estado', ['moto_id', 'estado'], { unique: false });
      }

      if (!db.objectStoreNames.contains('notificaciones')) {
        const notificaciones = db.createObjectStore('notificaciones', { keyPath: 'id' });
        notificaciones.createIndex('estado', 'estado', { unique: false });
        notificaciones.createIndex('registro_id', 'registro_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('tarifas')) {
        const tarifas = db.createObjectStore('tarifas', { keyPath: 'id' });
        tarifas.createIndex('fecha_inicio', 'fecha_inicio', { unique: false });

        // Semilla local igual a la tarifa inicial de database/parqueadero_db.sql,
        // para que la app cobre correctamente offline antes de la primera
        // sincronización (Fase 4). El sync posterior la sobreescribe si
        // el servidor tiene una tarifa vigente distinta.
        tarifas.transaction.oncomplete = () => {
          const seedTx = db.transaction('tarifas', 'readwrite');
          seedTx.objectStore('tarifas').add({
            id: 1,
            valor_hora: 8000,
            valor_fraccion: 0,
            minutos_gracia: 0,
            fecha_inicio: '2026-01-01T00:00:00.000Z',
            updated_at: nowIso(),
          });
        };
      }

      // Migración v1 -> v2: el negocio pasó a tarifa plana de $8.000 sin
      // importar el tiempo. Se actualizan las tarifas ya guardadas en
      // dispositivos existentes (si no, quedarían cobrando con la fórmula
      // vieja de horas/fracción aunque el código ya cambió).
      if (event.oldVersion < 2 && db.objectStoreNames.contains('tarifas')) {
        const tarifasStore = event.target.transaction.objectStore('tarifas');
        const getAllReq = tarifasStore.getAll();
        getAllReq.onsuccess = () => {
          const existentes = getAllReq.result;
          if (existentes.length === 0) {
            tarifasStore.add({
              id: 1,
              valor_hora: 8000,
              valor_fraccion: 0,
              minutos_gracia: 0,
              fecha_inicio: '2026-01-01T00:00:00.000Z',
              updated_at: nowIso(),
            });
          } else {
            existentes.forEach((t) => {
              tarifasStore.put({
                ...t,
                valor_hora: 8000,
                valor_fraccion: 0,
                minutos_gracia: 0,
                updated_at: nowIso(),
              });
            });
          }
        };
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

/** Genera un código corto y legible a partir de un UUID (para SMS). */
function shortId(id) {
  return id.slice(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------
// Propietarios
// ---------------------------------------------------------------------

async function getPropietario(cedula) {
  const store = await tx('propietarios', 'readonly');
  return reqToPromise(store.get(cedula));
}

/** Crea o actualiza un propietario (upsert por cédula). */
async function guardarPropietario({ cedula, nombre, telefono }) {
  const store = await tx('propietarios', 'readwrite');
  const existente = await reqToPromise(store.get(cedula));
  const registro = {
    cedula,
    nombre,
    telefono,
    created_at: existente ? existente.created_at : nowIso(),
    updated_at: nowIso(),
    sync_status: 'PENDIENTE',
  };
  await reqToPromise(store.put(registro));
  return registro;
}

// ---------------------------------------------------------------------
// Motos
// ---------------------------------------------------------------------

async function getMotoPorPlaca(placa) {
  if (!placa) return undefined;
  const store = await tx('motos', 'readonly');
  const index = store.index('placa');
  return reqToPromise(index.get(placa));
}

async function getMoto(id) {
  const store = await tx('motos', 'readonly');
  return reqToPromise(store.get(id));
}

async function getMotosPorCedula(cedula) {
  const store = await tx('motos', 'readonly');
  const index = store.index('cedula_propietario');
  return reqToPromise(index.getAll(cedula));
}

/**
 * Crea la moto si no existe una con esa placa; si existe, la reutiliza
 * (actualizando sus datos). Motos sin placa siempre se crean nuevas.
 */
async function guardarOReutilizarMoto({ placa, marca, color, descripcion, cedula_propietario }) {
  const store = await tx('motos', 'readwrite');
  let existente = null;

  if (placa) {
    existente = await reqToPromise(store.index('placa').get(placa));
  }

  const registro = {
    id: existente ? existente.id : uuid(),
    marca: marca || null,
    color: color || null,
    descripcion: descripcion || null,
    cedula_propietario,
    foto_url: existente ? existente.foto_url || null : null,
    created_at: existente ? existente.created_at : nowIso(),
    updated_at: nowIso(),
    sync_status: 'PENDIENTE',
  };

  // No incluir la propiedad "placa" cuando no hay placa: así el índice
  // único la ignora (IndexedDB no indexa claves "undefined") y se
  // permiten múltiples motos sin placa.
  if (placa) {
    registro.placa = placa;
  }

  await reqToPromise(store.put(registro));
  return registro;
}

// ---------------------------------------------------------------------
// Registros (ingresos/salidas)
// ---------------------------------------------------------------------

async function getRegistroActivoPorMoto(motoId) {
  const store = await tx('registros', 'readonly');
  const index = store.index('moto_estado');
  return reqToPromise(index.get([motoId, 'EN_PARQUEADERO']));
}

async function getRegistro(id) {
  const store = await tx('registros', 'readonly');
  return reqToPromise(store.get(id));
}

async function guardarRegistro(registro) {
  const store = await tx('registros', 'readwrite');
  await reqToPromise(store.put(registro));
  return registro;
}

async function getTodosRegistros() {
  const store = await tx('registros', 'readonly');
  return reqToPromise(store.getAll());
}

/**
 * Crea el registro de ingreso EN_PARQUEADERO para una moto.
 * Lanza error si la moto ya tiene un ingreso activo.
 */
async function crearIngreso({ motoId, usuarioId }) {
  const activo = await getRegistroActivoPorMoto(motoId);
  if (activo) {
    throw new Error('Esta moto ya tiene un ingreso activo en el parqueadero.');
  }

  const registro = {
    id: uuid(),
    moto_id: motoId,
    usuario_id: usuarioId || null,
    hora_ingreso: nowIso(),
    hora_salida: null,
    valor_cobrado: null,
    estado: 'EN_PARQUEADERO',
    sync_status: 'PENDIENTE',
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  await guardarRegistro(registro);
  return registro;
}

// ---------------------------------------------------------------------
// Notificaciones (cola de SMS)
// ---------------------------------------------------------------------

async function encolarNotificacion({ registroId, tipo, telefono, mensaje }) {
  const store = await tx('notificaciones', 'readwrite');
  const notificacion = {
    id: uuid(),
    registro_id: registroId,
    tipo,
    telefono,
    mensaje,
    estado: 'PENDIENTE',
    intentos: 0,
    respuesta_api: null,
    sent_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    sync_status: 'PENDIENTE',
  };
  await reqToPromise(store.put(notificacion));
  return notificacion;
}

// ---------------------------------------------------------------------
// Tarifas (espejo de lectura; se sincronizan desde el servidor)
// ---------------------------------------------------------------------

async function getTarifaVigente() {
  const store = await tx('tarifas', 'readonly');
  const todas = await reqToPromise(store.getAll());
  if (todas.length === 0) return null;
  return todas.reduce((vigente, t) =>
    !vigente || new Date(t.fecha_inicio) > new Date(vigente.fecha_inicio) ? t : vigente
  , null);
}

async function guardarTarifa(tarifa) {
  const store = await tx('tarifas', 'readwrite');
  await reqToPromise(store.put(tarifa));
}

// ---------------------------------------------------------------------
// Buscador (RF2) y ficha de moto
// ---------------------------------------------------------------------

async function enriquecerRegistro(registro) {
  const moto = await getMoto(registro.moto_id);
  const propietario = moto ? await getPropietario(moto.cedula_propietario) : null;
  return { registro, moto, propietario };
}

/**
 * Busca por cédula o placa, autodetectando cuál es (solo dígitos = cédula).
 * Devuelve todas las motos asociadas con su registro activo si lo tienen.
 */
async function buscar(consulta) {
  const q = (consulta || '').trim();
  if (!q) return { tipo: null, propietario: null, resultados: [] };

  const esCedula = /^\d+$/.test(q);

  if (esCedula) {
    const propietario = await getPropietario(q);
    if (!propietario) return { tipo: 'cedula', propietario: null, resultados: [] };
    const motos = await getMotosPorCedula(q);
    const resultados = await Promise.all(motos.map(async (moto) => ({
      moto,
      propietario,
      registroActivo: await getRegistroActivoPorMoto(moto.id),
    })));
    return { tipo: 'cedula', propietario, resultados };
  }

  const placa = q.toUpperCase();
  const moto = await getMotoPorPlaca(placa);
  if (!moto) return { tipo: 'placa', propietario: null, resultados: [] };
  const propietario = await getPropietario(moto.cedula_propietario);
  const registroActivo = await getRegistroActivoPorMoto(moto.id);
  return { tipo: 'placa', propietario, resultados: [{ moto, propietario, registroActivo }] };
}

/** Todas las motos actualmente EN_PARQUEADERO, más recientes primero. */
async function getRegistrosEnParqueadero() {
  const store = await tx('registros', 'readonly');
  const index = store.index('estado');
  const registros = await reqToPromise(index.getAll('EN_PARQUEADERO'));
  const enriquecidos = await Promise.all(registros.map(enriquecerRegistro));
  enriquecidos.sort((a, b) => new Date(b.registro.hora_ingreso) - new Date(a.registro.hora_ingreso));
  return enriquecidos;
}

/** Conteos para el panel de estadísticas: en parqueadero, entregadas, y el total histórico de ingresos. */
async function getEstadisticas() {
  const store = await tx('registros', 'readonly');
  const todos = await reqToPromise(store.getAll());
  const enParqueadero = todos.filter((r) => r.estado === 'EN_PARQUEADERO').length;
  const retiradas = todos.filter((r) => r.estado === 'RETIRADA').length;
  return { enParqueadero, retiradas, total: todos.length };
}

// ---------------------------------------------------------------------
// Entrega de moto (RF3) e historial (RF4)
// ---------------------------------------------------------------------

/**
 * Marca un registro como RETIRADA. horaSalida y valor ya deben venir
 * calculados (ver js/calculo.js) para que el SMS y lo guardado coincidan.
 */
async function entregarMoto(registroId, { horaSalida, valor }) {
  const store = await tx('registros', 'readwrite');
  const registro = await reqToPromise(store.get(registroId));
  if (!registro) {
    throw new Error('Registro no encontrado.');
  }
  if (registro.estado !== 'EN_PARQUEADERO') {
    throw new Error('Esta moto ya fue entregada.');
  }

  registro.hora_salida = horaSalida;
  registro.valor_cobrado = valor;
  registro.estado = 'RETIRADA';
  registro.sync_status = 'PENDIENTE';
  registro.updated_at = nowIso();

  await reqToPromise(store.put(registro));
  return registro;
}

/** Registros RETIRADA, filtrables por cédula/placa (texto) y fecha (YYYY-MM-DD). */
async function getHistorial({ query, fecha } = {}) {
  const store = await tx('registros', 'readonly');
  const index = store.index('estado');
  const registros = await reqToPromise(index.getAll('RETIRADA'));
  const enriquecidos = await Promise.all(registros.map(enriquecerRegistro));

  const queryNorm = (query || '').trim().toUpperCase();
  const fechaNorm = (fecha || '').trim();

  const filtrados = enriquecidos.filter(({ moto, propietario }) => {
    if (!queryNorm) return true;
    const coincideCedula = !!propietario && propietario.cedula.toUpperCase().includes(queryNorm);
    const coincidePlaca = !!moto && !!moto.placa && moto.placa.toUpperCase().includes(queryNorm);
    return coincideCedula || coincidePlaca;
  }).filter(({ registro }) => {
    if (!fechaNorm) return true;
    return (registro.hora_ingreso || '').slice(0, 10) === fechaNorm;
  });

  filtrados.sort((a, b) => new Date(b.registro.hora_salida) - new Date(a.registro.hora_salida));
  return filtrados;
}

// ---------------------------------------------------------------------
// Utilidades genéricas usadas por el motor de sincronización (Fase 4)
// ---------------------------------------------------------------------

async function getPendientes(storeName) {
  const store = await tx(storeName, 'readonly');
  const todos = await reqToPromise(store.getAll());
  return todos.filter((item) => item.sync_status === 'PENDIENTE');
}

async function marcarSincronizado(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  const item = await reqToPromise(store.get(id));
  if (item) {
    item.sync_status = 'SINCRONIZADO';
    await reqToPromise(store.put(item));
  }
}

/**
 * Aplica al espejo local los cambios descargados del servidor (lo que
 * registraron OTROS dispositivos con la misma cuenta). Last-write-wins
 * por updated_at: si el registro local es más nuevo que el del servidor
 * (normalmente porque todavía no se ha subido), no se pisa. Cada ítem se
 * procesa por separado para que un choque puntual (p. ej. una placa que
 * colisiona con otra moto) no bloquee el resto del lote.
 */
async function aplicarCambiosServidor(storeName, registrosRemotos) {
  if (!registrosRemotos || registrosRemotos.length === 0) return;
  const keyField = STORES[storeName];

  for (const remoto of registrosRemotos) {
    try {
      const clave = remoto[keyField];
      const storeLectura = await tx(storeName, 'readonly');
      const local = await reqToPromise(storeLectura.get(clave));

      if (local && local.updated_at && new Date(local.updated_at) > new Date(remoto.updated_at)) {
        continue;
      }

      const storeEscritura = await tx(storeName, 'readwrite');
      await reqToPromise(storeEscritura.put({ ...remoto, sync_status: 'SINCRONIZADO' }));
    } catch (err) {
      console.warn(`[db] No se pudo aplicar el cambio remoto de ${storeName} (${remoto[keyField]}):`, err);
    }
  }
}

window.ParqueaderoDB = {
  openDb,
  uuid,
  shortId,
  nowIso,
  getPropietario,
  guardarPropietario,
  getMotoPorPlaca,
  getMoto,
  getMotosPorCedula,
  guardarOReutilizarMoto,
  getRegistroActivoPorMoto,
  getRegistro,
  guardarRegistro,
  getTodosRegistros,
  crearIngreso,
  encolarNotificacion,
  getTarifaVigente,
  guardarTarifa,
  buscar,
  getRegistrosEnParqueadero,
  getEstadisticas,
  entregarMoto,
  getHistorial,
  getPendientes,
  marcarSincronizado,
  aplicarCambiosServidor,
};
