<?php

declare(strict_types=1);

namespace Api\Controllers;

use Api\Services\NotificacionService;
use Api\Services\SyncService;
use Throwable;

final class SyncController
{
    public function sync(): void
    {
        $body = json_decode(file_get_contents('php://input') ?: '', true);

        if (!is_array($body)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Cuerpo JSON inválido.']);
            return;
        }

        $servicio = new SyncService();
        $resultado = $servicio->procesarLote($body);

        // Tras cada sync exitoso se procesa la cola de SMS pendiente. Un
        // fallo aquí (proveedor caído, sin credenciales) no debe tumbar
        // la respuesta del sync: el offline-first del parqueo es lo
        // crítico, el SMS puede reintentarse en el siguiente sync.
        $smsResumen = null;
        try {
            $smsResumen = (new NotificacionService())->procesarPendientes();
        } catch (Throwable $e) {
            $smsResumen = ['error' => $e->getMessage()];
        }

        echo json_encode(['ok' => true, 'resultado' => $resultado, 'smsResumen' => $smsResumen]);
    }

    public function descargar(): void
    {
        $desde = isset($_GET['desde']) && $_GET['desde'] !== '' ? (string) $_GET['desde'] : null;

        $servicio = new SyncService();
        $cambios = $servicio->obtenerCambiosDesde($desde);

        echo json_encode([
            'ok' => true,
            'propietarios' => $cambios['propietarios'],
            'motos' => $cambios['motos'],
            'registros' => $cambios['registros'],
            'notificaciones' => $cambios['notificaciones'],
            // Cursor para la próxima descarga incremental: la hora del
            // servidor al momento de esta consulta, no la del navegador.
            'servidorHora' => gmdate('Y-m-d\TH:i:s.000\Z'),
        ]);
    }
}
