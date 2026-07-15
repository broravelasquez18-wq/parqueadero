/**
 * Login del administrador. El sistema debe abrir y operar 100% offline
 * en el día a día, así que la sesión se valida contra el servidor una
 * sola vez (requiere internet) y luego se guarda localmente: mientras
 * haya una sesión guardada, la app abre sin red. Solo la PRIMERA vez en
 * cada dispositivo hace falta conexión para iniciar sesión.
 *
 * No se guarda la contraseña en ningún momento, solo los datos básicos
 * del usuario autenticado (id, nombre, usuario, rol).
 */
const SESSION_KEY = 'parqueadero_sesion';
const LOGIN_URL = new URL('../api/auth/login', window.location.href).toString();

function obtenerSesion() {
  try {
    const cruda = localStorage.getItem(SESSION_KEY);
    return cruda ? JSON.parse(cruda) : null;
  } catch {
    return null;
  }
}

function guardarSesion(usuario) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
}

function borrarSesion() {
  localStorage.removeItem(SESSION_KEY);
}

function mostrarApp(usuario) {
  document.getElementById('pantalla-login').classList.add('oculto');
  document.getElementById('app-contenido').classList.remove('oculto');

  const chip = document.getElementById('header-usuario');
  if (chip) chip.textContent = usuario.nombre;
}

function mostrarLogin() {
  document.getElementById('pantalla-login').classList.remove('oculto');
  document.getElementById('app-contenido').classList.add('oculto');
}

async function manejarSubmitLogin(event) {
  event.preventDefault();

  const usuarioInput = document.getElementById('login-usuario');
  const passwordInput = document.getElementById('login-password');
  const mensajeEl = document.getElementById('login-mensaje');
  const btn = document.getElementById('btn-login-submit');

  mensajeEl.innerHTML = '';

  if (!navigator.onLine) {
    mensajeEl.innerHTML = '<div class="aviso error">Necesitas conexión a internet para iniciar sesión la primera vez en este dispositivo. Una vez inicies sesión, la app seguirá abriendo sin conexión.</div>';
    return;
  }

  btn.disabled = true;
  try {
    const respuesta = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuarioInput.value.trim(), password: passwordInput.value }),
    });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok || !cuerpo.ok) {
      mensajeEl.innerHTML = `<div class="aviso error">${cuerpo.error || 'No se pudo iniciar sesión.'}</div>`;
      return;
    }

    guardarSesion(cuerpo.usuario);
    passwordInput.value = '';
    mostrarApp(cuerpo.usuario);
  } catch (err) {
    mensajeEl.innerHTML = '<div class="aviso error">No se pudo conectar con el servidor. Si es la primera vez que inicias sesión en este dispositivo, revisa tu conexión a internet e intenta de nuevo.</div>';
  } finally {
    btn.disabled = false;
  }
}

function manejarLogout() {
  borrarSesion();
  mostrarLogin();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('form-login').addEventListener('submit', manejarSubmitLogin);
  document.getElementById('btn-logout').addEventListener('click', manejarLogout);

  const sesion = obtenerSesion();
  if (sesion) {
    mostrarApp(sesion);
  } else {
    mostrarLogin();
  }
});
