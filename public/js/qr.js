/**
 * Códigos QR para acelerar la búsqueda: cada registro exitoso muestra un
 * QR con el id de la moto (funciona igual con o sin placa). Escanearlo
 * en "Buscar" abre la ficha directo, sin escribir nada. Librerías
 * cargadas por CDN en index.html y cacheadas por el service worker tras
 * el primer uso con internet (mismo patrón que Tesseract.js para OCR).
 */

let escaneoActivo = false;

/** Dibuja el QR de `texto` dentro de un <canvas> ya presente en el DOM. */
function generarQR(canvasEl, texto) {
  if (typeof QRCode === 'undefined') {
    console.warn('[qr] Librería de generación de QR no disponible (sin conexión y sin caché previa).');
    return;
  }
  QRCode.toCanvas(canvasEl, texto, { width: 160, margin: 1 }, (err) => {
    if (err) console.error('[qr] No se pudo generar el código QR:', err);
  });
}

/**
 * Lee frames del video en un loop hasta encontrar un QR válido, y llama
 * a `alEncontrar(texto)` una sola vez. Se puede cortar con detenerEscaneo().
 */
function escanear(videoEl, alEncontrar) {
  if (typeof jsQR === 'undefined') {
    console.warn('[qr] Librería de lectura de QR no disponible (sin conexión y sin caché previa).');
    return;
  }

  escaneoActivo = true;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  function procesarFrame() {
    if (!escaneoActivo) return;

    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA && videoEl.videoWidth > 0) {
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const codigo = jsQR(imageData.data, imageData.width, imageData.height);

      if (codigo && codigo.data) {
        escaneoActivo = false;
        alEncontrar(codigo.data);
        return;
      }
    }

    requestAnimationFrame(procesarFrame);
  }

  requestAnimationFrame(procesarFrame);
}

function detenerEscaneo() {
  escaneoActivo = false;
}

window.ParqueaderoQR = {
  generarQR,
  escanear,
  detenerEscaneo,
};
