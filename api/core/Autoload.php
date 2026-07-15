<?php

declare(strict_types=1);

/**
 * Autoloader mínimo (sin Composer): Api\Core\Foo -> api/core/Foo.php,
 * Api\Controllers\Foo -> api/controllers/Foo.php, etc. Los directorios
 * del proyecto son en minúscula; los namespaces siguen la convención
 * habitual en mayúscula inicial por segmento.
 */
spl_autoload_register(function (string $class): void {
    $prefix = 'Api\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $parts = explode('\\', $relative);
    $className = array_pop($parts);
    $dirParts = array_map('strtolower', $parts);

    $path = __DIR__ . '/../' . implode('/', $dirParts) . '/' . $className . '.php';

    if (is_file($path)) {
        require $path;
    }
});
