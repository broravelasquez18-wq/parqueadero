<?php

declare(strict_types=1);

namespace Api\Core;

/**
 * Router mínimo: mapea método + ruta (ya sin el prefijo /api) a
 * [Clase, método] de un controlador.
 */
final class Router
{
    /** @var array<string, array<string, array{0:string,1:string}>> */
    private array $routes = [];

    public function post(string $path, array $handler): void
    {
        $this->routes['POST'][$path] = $handler;
    }

    public function get(string $path, array $handler): void
    {
        $this->routes['GET'][$path] = $handler;
    }

    public function dispatch(string $method, string $path): void
    {
        $path = '/' . trim($path, '/');
        $handler = $this->routes[$method][$path] ?? null;

        if ($handler === null) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Ruta no encontrada: ' . $method . ' ' . $path]);
            return;
        }

        [$class, $methodName] = $handler;
        $controller = new $class();
        $controller->$methodName();
    }
}
