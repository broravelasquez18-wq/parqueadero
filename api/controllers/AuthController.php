<?php

declare(strict_types=1);

namespace Api\Controllers;

use Api\Core\Database;
use Api\Models\Usuario;

final class AuthController
{
    public function login(): void
    {
        $body = json_decode(file_get_contents('php://input') ?: '', true);

        if (!is_array($body) || empty($body['usuario']) || empty($body['password'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Usuario y contraseña son obligatorios.']);
            return;
        }

        $usuario = Usuario::buscarPorUsuario(Database::connection(), (string) $body['usuario']);

        if ($usuario === null || !$usuario['activo'] || !password_verify((string) $body['password'], $usuario['password_hash'])) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'Credenciales inválidas.']);
            return;
        }

        echo json_encode([
            'ok' => true,
            'usuario' => [
                'id' => (int) $usuario['id'],
                'nombre' => $usuario['nombre'],
                'usuario' => $usuario['usuario'],
                'rol' => $usuario['rol'],
            ],
        ]);
    }
}
