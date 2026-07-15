<?php

declare(strict_types=1);

namespace Api\Models;

use Api\Core\DateUtil;
use PDO;

final class Propietario
{
    /** Inserta o actualiza (last-write-wins por updated_at) un propietario. */
    public static function upsert(PDO $pdo, array $d): void
    {
        $sql = "INSERT INTO propietarios (cedula, nombre, telefono, created_at, updated_at)
                VALUES (:cedula, :nombre, :telefono, :created_at, :updated_at)
                ON DUPLICATE KEY UPDATE
                    nombre = IF(VALUES(updated_at) > updated_at, VALUES(nombre), nombre),
                    telefono = IF(VALUES(updated_at) > updated_at, VALUES(telefono), telefono),
                    updated_at = IF(VALUES(updated_at) > updated_at, VALUES(updated_at), updated_at)";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'cedula' => $d['cedula'],
            'nombre' => $d['nombre'],
            'telefono' => $d['telefono'],
            'created_at' => DateUtil::toMysql($d['created_at'] ?? null) ?? date('Y-m-d H:i:s'),
            'updated_at' => DateUtil::toMysql($d['updated_at'] ?? null) ?? date('Y-m-d H:i:s'),
        ]);
    }
}
