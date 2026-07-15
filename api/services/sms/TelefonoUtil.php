<?php

declare(strict_types=1);

namespace Api\Services\Sms;

final class TelefonoUtil
{
    /** Normaliza a E.164 asumiendo Colombia (+57) cuando no viene con indicativo. */
    public static function formatearColombia(string $telefono): string
    {
        $limpio = preg_replace('/[^\d+]/', '', $telefono) ?? $telefono;

        if (str_starts_with($limpio, '+')) {
            return $limpio;
        }
        if (str_starts_with($limpio, '57') && strlen($limpio) === 12) {
            return '+' . $limpio;
        }
        return '+57' . $limpio;
    }
}
