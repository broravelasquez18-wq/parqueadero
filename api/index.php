<?php

declare(strict_types=1);

require __DIR__ . '/core/Autoload.php';

use Api\Controllers\AuthController;
use Api\Controllers\NotificacionController;
use Api\Controllers\SyncController;
use Api\Core\Env;
use Api\Core\Router;

Env::load();
ini_set('display_errors', Env::get('APP_DEBUG', 'false') === 'true' ? '1' : '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

$router = new Router();
$router->post('/sync', [SyncController::class, 'sync']);
$router->get('/sync', [SyncController::class, 'descargar']);
$router->post('/auth/login', [AuthController::class, 'login']);
$router->post('/notificaciones/procesar', [NotificacionController::class, 'procesar']);

// La ruta ya llega sin el prefijo "/api" (ver api/.htaccess): p.ej.
// http://localhost/parqueadero/api/sync -> "/sync".
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$rutaSinApi = preg_replace('#^.*?/api#', '', $requestPath, 1) ?? '';

try {
    $router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $rutaSinApi);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => Env::get('APP_DEBUG', 'false') === 'true' ? $e->getMessage() : 'Error interno del servidor.',
    ]);
}
