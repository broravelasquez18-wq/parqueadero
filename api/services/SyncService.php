<?php

declare(strict_types=1);

namespace Api\Services;

use Api\Core\Database;
use Api\Models\Moto;
use Api\Models\Notificacion;
use Api\Models\Propietario;
use Api\Models\Registro;
use Throwable;

/**
 * Recibe el lote de cambios pendientes que llega desde IndexedDB y lo
 * persiste en MySQL. Cada fila se procesa de forma independiente (no en
 * una única transacción de todo o nada) para que el fallo de un ítem no
 * bloquee la sincronización del resto del lote.
 */
final class SyncService
{
    public function procesarLote(array $payload): array
    {
        $pdo = Database::connection();

        $resultado = [
            'propietarios' => [],
            'motos' => [],
            'registros' => [],
            'notificaciones' => [],
        ];

        foreach ($payload['propietarios'] ?? [] as $p) {
            $resultado['propietarios'][] = $this->intentar($p['cedula'] ?? null, function () use ($pdo, $p) {
                Propietario::upsert($pdo, $p);
            });
        }

        foreach ($payload['motos'] ?? [] as $m) {
            $resultado['motos'][] = $this->intentar($m['id'] ?? null, function () use ($pdo, $m) {
                Moto::upsert($pdo, $m);
            });
        }

        foreach ($payload['registros'] ?? [] as $r) {
            $resultado['registros'][] = $this->intentar($r['id'] ?? null, function () use ($pdo, $r) {
                if (($r['estado'] ?? null) === 'EN_PARQUEADERO'
                    && !Registro::sinIngresoActivoDuplicado($pdo, $r['moto_id'], $r['id'])
                ) {
                    throw new \RuntimeException('Esta moto ya tiene otro ingreso activo registrado en el servidor.');
                }
                Registro::upsert($pdo, $r);
            });
        }

        foreach ($payload['notificaciones'] ?? [] as $n) {
            $resultado['notificaciones'][] = $this->intentar($n['id'] ?? null, function () use ($pdo, $n) {
                Notificacion::insertarSiNoExiste($pdo, $n);
            });
        }

        return $resultado;
    }

    private function intentar(?string $id, callable $accion): array
    {
        try {
            $accion();
            return ['id' => $id, 'status' => 'ok'];
        } catch (Throwable $e) {
            return ['id' => $id, 'status' => 'error', 'message' => $e->getMessage()];
        }
    }
}
