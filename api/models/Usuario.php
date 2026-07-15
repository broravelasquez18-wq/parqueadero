<?php

declare(strict_types=1);

namespace Api\Models;

use PDO;

final class Usuario
{
    public static function buscarPorUsuario(PDO $pdo, string $usuario): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE usuario = :usuario LIMIT 1');
        $stmt->execute(['usuario' => $usuario]);
        $fila = $stmt->fetch();
        return $fila === false ? null : $fila;
    }
}
