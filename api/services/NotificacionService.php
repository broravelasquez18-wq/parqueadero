<?php

declare(strict_types=1);

namespace Api\Services;

use Api\Core\Database;
use Api\Core\Env;
use Throwable;

/**
 * Procesa la cola de notificaciones PENDIENTE/FALLIDO (hasta 3 intentos):
 * llama a la pasarela de SMS y actualiza estado, intentos y respuesta_api.
 * Nunca lanza hacia afuera: un fallo de SMS no debe romper la sincronización.
 */
final class NotificacionService
{
    private const MAX_INTENTOS = 3;

    public function procesarPendientes(): array
    {
        // Interruptor general: con SMS_ENVIO_ACTIVO=false la cola se sigue
        // llenando normalmente (nada se pierde), pero no se intenta enviar
        // nada todavía. Útil mientras no hay un proveedor de SMS listo
        // (cuenta Twilio limitada, Android/módem GSM sin configurar aún).
        if (Env::get('SMS_ENVIO_ACTIVO', 'true') !== 'true') {
            return ['procesadas' => 0, 'enviadas' => 0, 'fallidas' => 0, 'desactivado' => true];
        }

        $pdo = Database::connection();
        $sms = new SmsService();

        $stmt = $pdo->prepare(
            "SELECT * FROM notificaciones
             WHERE estado IN ('PENDIENTE', 'FALLIDO') AND intentos < :max
             ORDER BY created_at ASC"
        );
        $stmt->execute(['max' => self::MAX_INTENTOS]);
        $pendientes = $stmt->fetchAll();

        $resumen = ['procesadas' => 0, 'enviadas' => 0, 'fallidas' => 0];

        foreach ($pendientes as $n) {
            $resumen['procesadas']++;

            try {
                $resultado = $sms->enviar($n['telefono'], $n['mensaje']);
                $exito = $resultado['exito'];
                $detalle = $resultado['detalle'];
            } catch (Throwable $e) {
                $exito = false;
                $detalle = 'Error inesperado al enviar el SMS: ' . $e->getMessage();
            }

            $resumen[$exito ? 'enviadas' : 'fallidas']++;

            $update = $pdo->prepare(
                "UPDATE notificaciones
                 SET estado = :estado, intentos = intentos + 1, respuesta_api = :respuesta,
                     sent_at = :sent_at, updated_at = NOW()
                 WHERE id = :id"
            );
            $update->execute([
                'estado' => $exito ? 'ENVIADO' : 'FALLIDO',
                'respuesta' => $detalle,
                'sent_at' => $exito ? date('Y-m-d H:i:s') : null,
                'id' => $n['id'],
            ]);
        }

        return $resumen;
    }
}
