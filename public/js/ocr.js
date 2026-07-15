/**
 * Wrapper de OCR para lectura de placas de moto colombianas con
 * Tesseract.js (cargado por CDN en index.html y cacheado por el
 * service worker tras el primer uso con internet).
 */
const PLACA_REGEX = /[A-Z]{3}\d{2}[A-Z]/;

let tesseractWorker = null;

async function getWorker() {
  if (tesseractWorker) return tesseractWorker;
  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js no está disponible (sin conexión y sin caché previa).');
  }
  tesseractWorker = await Tesseract.createWorker('eng');
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

/** Captura el frame actual del video como dataURL (imagen JPEG). */
function capturarFrame(videoEl) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Corre OCR sobre una imagen (dataURL, Blob o File) y extrae la placa
 * con el patrón de moto colombiana AAA99A. Devuelve { placa, textoCrudo }.
 * placa es null si no se encontró un patrón válido.
 */
async function reconocerPlaca(imagenFuente) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imagenFuente);
  const textoCrudo = (data.text || '').toUpperCase();
  const textoLimpio = textoCrudo.replace(/[^A-Z0-9]/g, '');
  const match = textoLimpio.match(PLACA_REGEX);
  return {
    placa: match ? match[0] : null,
    textoCrudo,
  };
}

window.ParqueaderoOCR = {
  PLACA_REGEX,
  iniciarCamara,
  detenerCamara,
  capturarFrame,
  reconocerPlaca,
};
