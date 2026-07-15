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
}
