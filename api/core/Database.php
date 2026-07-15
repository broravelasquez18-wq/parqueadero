<?php

declare(strict_types=1);

namespace Api\Core;

use PDO;
use PDOException;

/**
 * Conexión PDO única (singleton) a MySQL, configurada desde .env.
 */
final class Database
{
    private static ?PDO $instance = null;

    public static function connection(): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        Env::load();

        $host = Env::get('DB_HOST', '127.0.0.1');
        $port = Env::get('DB_PORT', '3306');
        $name = Env::get('DB_NAME', 'parqueadero_db');
        $user = Env::get('DB_USER', 'root');
        $pass = Env::get('DB_PASS', '') ?? '';

        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

        try {
            self::$instance = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            throw new PDOException('No se pudo conectar a la base de datos: ' . $e->getMessage(), (int) $e->getCode());
        }

        return self::$instance;
    }
}
