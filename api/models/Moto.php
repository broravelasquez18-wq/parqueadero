<?php

declare(strict_types=1);

namespace Api\Models;

use Api\Core\DateUtil;
use PDO;

final class Moto
{
    /** Inserta o actualiza (last-write-wins por updated_at) una moto, por id. */
    public static function upsert(PDO $pdo, array $d): void
    {
        $sql = "INSERT INTO motos (id, placa, marca, color, descripcion, cedula_propietario, foto_url, created_at, updated_at)
                VALUES (:id, :placa, :marca, :color, :descripcion, :cedula_propietario, :foto_url, :created_at, :updated_at)
                ON DUPLICATE KEY UPDATE
                    placa = IF(VALUES(updated_at) > updated_at, VALUES(placa), placa),
                    marca = IF(VALUES(updated_at) > updated_at, VALUES(marca), marca),
                    color = IF(VALUES(updated_at) > updated_at, VALUES(color), color),
                    descripcion = IF(VALUES(updated_at) > updated_at, VALUES(descripcion), descripcion),
                    cedula_propietario = IF(VALUES(updated_at) > updated_at, VALUES(cedula_propietario), cedula_propietario),
                    foto_url = IF(VALUES(updated_at) > updated_at, VALUES(foto_url), foto_url),
                    updated_at = IF(VALUES(updated_at) > updated_at, VALUES(updated_at), updated_at)";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'id' => $d['id'],
            'placa' => $d['placa'] ?? null,
            'marca' => $d['marca'] ?? null,
            'color' => $d['color'] ?? null,
            'descripcion' => $d['descripcion'] ?? null,
            'cedula_propietario' => $d['cedula_propietario'],
            'foto_url' => $d['foto_url'] ?? null,
            'created_at' => DateUtil::toMysql($d['created_at'] ?? null) ?? date('Y-m-d H:i:s'),
            'updated_at' => DateUtil::toMysql($d['updated_at'] ?? null) ?? date('Y-m-d H:i:s'),
        ]);
    }
}
