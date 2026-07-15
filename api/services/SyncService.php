<?php

declare(strict_types=1);

namespace Api\Services;

use Api\Core\Database;
use Api\Core\DateUtil;
use Api\Models\Moto;
use Api\Models\Notificacion;
use Api\Models\Propietario;
use Api\Models\Registro;
use PDO;
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

    /**
     * Todo lo que cambió en el servidor desde $desde (ISO 8601), para que
     * un dispositivo que no tiene nada pendiente por subir igual se entere
     * de lo que registraron otros dispositivos con la misma cuenta. Sin
     * $desde, trae todo (primera sincronización de un dispositivo nuevo).
     */
    public function obtenerCambiosDesde(?string $desde): array
    {
        $pdo = Database::connection();
        $desdeMysql = $desde ? DateUtil::toMysql($desde) : null;

        return [
            'propietarios' => $this->consultarTabla($pdo, 'propietarios', $desdeMysql),
            'motos' => $this->consultarTabla($pdo, 'motos', $desdeMysql),
            'registros' => $this->consultarTabla($pdo, 'registros', $desdeMysql),
            'notificaciones' => $this->consultarTabla($pdo, 'notificaciones', $desdeMysql),
        ];
    }

    private function consultarTabla(PDO $pdo, string $tabla, ?string $desdeMysql): array
    {
        // >= y no >: el DATETIME de MySQL solo tiene resolución de 1
        // segundo, así que un cambio que caiga en el mismo segundo que el
        // cursor de la sincronización anterior se perdería con ">". Volver
        // a traer un registro que ya se había traído es inofensivo (el
        // merge en el cliente es idempotente), solo un poco redundante.
        $sql = "SELECT * FROM {$tabla}" . ($desdeMysql ? ' WHERE updated_at >= :desde' : '') . ' ORDER BY updated_at ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($desdeMysql ? ['desde' => $desdeMysql] : []);

        return array_map([$this, 'normalizarFechas'], $stmt->fetchAll());
    }

    /**
     * PDO devuelve los DATETIME de MySQL como "2026-01-01 10:00:00"; el
     * cliente necesita ISO 8601 ("...T...Z") para que `new Date(...)`
     * los interprete igual en cualquier navegador.
     */
    private function normalizarFechas(array $fila): array
    {
        foreach ($fila as $clave => $valor) {
            if (is_string($valor) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $valor)) {
                $fila[$clave] = str_replace(' ', 'T', $valor) . '.000Z';
            }
        }
        return $fila;
    }
}
