<?php

declare(strict_types=1);

namespace Api\Controllers;

use Api\Services\NotificacionService;

final class NotificacionController
{
    public function procesar(): void
    {
        $resumen = (new NotificacionService())->procesarPendientes();
        echo json_encode(['ok' => true, 'resumen' => $resumen]);
    }
}
