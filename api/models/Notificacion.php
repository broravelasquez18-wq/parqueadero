<?php

declare(strict_types=1);

namespace Api\Models;

use Api\Core\DateUtil;
use PDO;

final class Notificacion
{
    /**
     * Inserta la notificación si no existe (el id UUID lo genera el
     * navegador). No se actualiza si ya existe: su estado de envío
     * (PENDIENTE/ENVIADO/FALLIDO) lo gestiona únicamente el servidor
     * al procesar la cola (Fase 5).
     */
    public static function insertarSiNoExiste(PDO $pdo, array $d): void
    {
        $sql = "INSERT INTO notificaciones
                    (id, registro_id, tipo, telefono, mensaje, estado, intentos, created_at, updated_at)
                VALUES
                    (:id, :registro_id, :tipo, :telefono, :mensaje, 'PENDIENTE', 0, :created_at, :updated_at)
                ON DUPLICATE KEY UPDATE id = id";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'id' => $d['id'],
            'registro_id' => $d['registro_id'],
            'tipo' => $d['tipo'],
            'telefono' => $d['telefono'],
            'mensaje' => $d['mensaje'],
            'created_at' => DateUtil::toMysql($d['created_at'] ?? null) ?? date('Y-m-d H:i:s'),
            'updated_at' => DateUtil::toMysql($d['updated_at'] ?? null) ?? date('Y-m-d H:i:s'),
        ]);
    }
}
