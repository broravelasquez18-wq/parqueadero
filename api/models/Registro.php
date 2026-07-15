<?php

declare(strict_types=1);

namespace Api\Models;

use Api\Core\DateUtil;
use PDO;

final class Registro
{
    /**
     * true si ninguna OTRA fila ya tiene esa moto como EN_PARQUEADERO.
     * Reimplementa en el servidor la regla de negocio que también se
     * valida en el navegador (js/db.js), porque MySQL no soporta
     * índices únicos parciales/filtrados.
     */
    public static function sinIngresoActivoDuplicado(PDO $pdo, string $motoId, string $registroId): bool
    {
        $sql = "SELECT COUNT(*) FROM registros
                WHERE moto_id = :moto_id AND estado = 'EN_PARQUEADERO' AND id != :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['moto_id' => $motoId, 'id' => $registroId]);
        return ((int) $stmt->fetchColumn()) === 0;
    }

    /** Inserta o actualiza (last-write-wins por updated_at) un registro, por id. */
    public static function upsert(PDO $pdo, array $d): void
    {
        $sql = "INSERT INTO registros
                    (id, moto_id, usuario_id, hora_ingreso, hora_salida, valor_cobrado, estado, sync_status, created_at, updated_at)
                VALUES
                    (:id, :moto_id, :usuario_id, :hora_ingreso, :hora_salida, :valor_cobrado, :estado, 'SINCRONIZADO', :created_at, :updated_at)
                ON DUPLICATE KEY UPDATE
                    hora_salida = IF(VALUES(updated_at) > updated_at, VALUES(hora_salida), hora_salida),
                    valor_cobrado = IF(VALUES(updated_at) > updated_at, VALUES(valor_cobrado), valor_cobrado),
                    estado = IF(VALUES(updated_at) > updated_at, VALUES(estado), estado),
                    sync_status = 'SINCRONIZADO',
                    updated_at = IF(VALUES(updated_at) > updated_at, VALUES(updated_at), updated_at)";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'id' => $d['id'],
            'moto_id' => $d['moto_id'],
            'usuario_id' => $d['usuario_id'] ?? null,
            'hora_ingreso' => DateUtil::toMysql($d['hora_ingreso']),
            'hora_salida' => DateUtil::toMysql($d['hora_salida'] ?? null),
            'valor_cobrado' => $d['valor_cobrado'] ?? null,
            'estado' => $d['estado'],
            'created_at' => DateUtil::toMysql($d['created_at'] ?? null) ?? date('Y-m-d H:i:s'),
            'updated_at' => DateUtil::toMysql($d['updated_at'] ?? null) ?? date('Y-m-d H:i:s'),
        ]);
    }
}
