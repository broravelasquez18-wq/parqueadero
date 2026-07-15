/**
 * Wrapper de OCR para lectura de placas de moto colombianas con
 * Tesseract.js (cargado por CDN en index.html y cacheado por el
 * service worker tras el primer uso con internet).
 *
 * Para mejorar la lectura con cámara de celular se hacen 3 cosas que
 * Tesseract "en crudo" no hace por sí solo:
 *  1. Se recorta la foto a la región del recuadro guía (menos ruido de
 *     fondo: asfalto, otras motos, etc.).
 *  2. Se pasa a escala de grises con autocontraste y se agranda si el
 *     recorte queda pequeño (Tesseract lee mal texto de pocos píxeles).
 *  3. Tesseract se configura en modo "una sola línea" con una lista de
 *     caracteres permitidos (solo A-Z y 0-9), y si el texto leído no
 *     calza con el patrón de placa, se prueban variantes corrigiendo las
 *     confusiones más comunes del OCR (0/O, 1/I, 5/S, 8/B, 2/Z).
 */
const PLACA_REGEX = /[A-Z]{3}\d{2}[A-Z]/;

// Debe coincidir con el recuadro guía dibujado en CSS (.camara-guia) para
// que se recorte justo lo que el usuario ve enmarcado en pantalla.
const GUIA_PLACA = { top: 0.35, left: 0.08, width: 0.84, height: 0.30 };

const CONFUSIONES = [['0', 'O'], ['1', 'I'], ['5', 'S'], ['8', 'B'], ['2', 'Z']];

let tesseractWorker = null;

async function getWorker() {
  if (tesseractWorker) return tesseractWorker;
  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js no está disponible (sin conexión y sin caché previa).');
  }
  tesseractWorker = await Tesseract.createWorker('eng');
  await tesseractWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  });
  return tesseractWorker;
}

/** Abre la cámara trasera (si existe) y la conecta al elemento <video>. */
async function iniciarCamara(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

function detenerCamara(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

/** Escala de grises + autocontraste (estira el rango de luminosidad real de la foto a 0-255). */
function mejorarContraste(ctx, ancho, alto) {
  const imageData = ctx.getImageData(0, 0, ancho, alto);
  const datos = imageData.data;
  const totalPixeles = ancho * alto;

  const grises = new Uint8ClampedArray(totalPixeles);
  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; i < datos.length; i += 4, p++) {
    const g = 0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2];
    grises[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }

  const rango = Math.max(1, max - min);
  for (let i = 0, p = 0; i < datos.length; i += 4, p++) {
    const estirado = ((grises[p] - min) / rango) * 255;
    datos[i] = datos[i + 1] = datos[i + 2] = estirado;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Captura el frame actual del video, recortado a la región del recuadro
 * guía (GUIA_PLACA) y con contraste mejorado, devuelto como dataURL.
 */
function capturarFrame(videoEl) {
  const anchoNativo = videoEl.videoWidth;
  const altoNativo = videoEl.videoHeight;

  const recorte = {
    x: Math.round(anchoNativo * GUIA_PLACA.left),
    y: Math.round(altoNativo * GUIA_PLACA.top),
    w: Math.round(anchoNativo * GUIA_PLACA.width),
    h: Math.round(altoNativo * GUIA_PLACA.height),
  };

  // Si el recorte queda con poca altura en píxeles, a Tesseract le
  // cuesta mucho leerlo bien: se agranda antes de pasarlo por OCR.
  const escala = recorte.h < 180 ? Math.ceil(180 / recorte.h) : 1;

  const canvas = document.createElement('canvas');
  canvas.width = recorte.w * escala;
  canvas.height = recorte.h * escala;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, recorte.x, recorte.y, recorte.w, recorte.h, 0, 0, canvas.width, canvas.height);

  mejorarContraste(ctx, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.95);
}

// Formato fijo de placa de moto colombiana: letra-letra-letra-dígito-dígito-letra.
const PATRON_POSICIONES = ['letra', 'letra', 'letra', 'digito', 'digito', 'letra'];

/**
 * Corrige un carácter según lo que se espera en su posición (letra o
 * dígito), usando el par de confusión correspondiente si aplica. Por
 * ejemplo, una "O" en una posición que debe ser dígito se corrige a "0",
 * pero una "O" en una posición que debe ser letra se deja igual.
 */
function normalizarCaracter(c, tipoEsperado) {
  const par = CONFUSIONES.find(([digito, letra]) => c === digito || c === letra);
  if (!par) return c;
  const [digito, letra] = par;
  return tipoEsperado === 'digito' ? digito : letra;
}

/**
 * Prueba cada ventana de 6 caracteres del texto leído, corrigiendo cada
 * posición según el patrón fijo de la placa (letra-letra-letra-dígito-
 * dígito-letra). Necesario porque un reemplazo global (p. ej. cambiar
 * todas las "2" por "Z") rompe los casos donde el mismo carácter
 * confundido aparece una vez como letra mal leída y otra vez como dígito
 * correcto dentro de la misma placa.
 */
function buscarConCorreccionPosicional(texto) {
  for (let i = 0; i + 6 <= texto.length; i++) {
    const candidato = texto.slice(i, i + 6);
    const corregido = candidato
      .split('')
      .map((c, pos) => normalizarCaracter(c, PATRON_POSICIONES[pos]))
      .join('');

    if (PLACA_REGEX.test(corregido)) {
      return corregido;
    }
  }
  return null;
}

/**
 * Corre OCR sobre una imagen (dataURL, Blob o File) y extrae la placa
 * con el patrón de moto colombiana AAA99A. Si la lectura directa no
 * calza con el patrón, intenta corregir confusiones frecuentes del OCR
 * (0/O, 1/I, 5/S, 8/B, 2/Z) según la posición esperada de cada carácter
 * antes de rendirse. Devuelve { placa, textoCrudo }; placa es null si no
 * se encontró un patrón válido.
 */
async function reconocerPlaca(imagenFuente) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imagenFuente);
  const textoCrudo = (data.text || '').toUpperCase();
  const textoLimpio = textoCrudo.replace(/[^A-Z0-9]/g, '');

  const match = textoLimpio.match(PLACA_REGEX);
  const placa = match ? match[0] : buscarConCorreccionPosicional(textoLimpio);

  return { placa, textoCrudo };
}

window.ParqueaderoOCR = {
  PLACA_REGEX,
  GUIA_PLACA,
  iniciarCamara,
  detenerCamara,
  capturarFrame,
  reconocerPlaca,
};
