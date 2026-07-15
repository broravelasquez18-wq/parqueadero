<?php

declare(strict_types=1);

namespace Api\Services\Sms;

interface SmsProviderInterface
{
    /**
     * Envía un SMS. Nunca lanza para errores esperados de la pasarela
     * (credenciales faltantes, HTTP de error, timeout): esos se reportan
     * como exito=false con el detalle, para que la cola pueda marcar
     * FALLIDO y reintentar más tarde sin romper el flujo.
     *
     * @return array{exito: bool, detalle: string}
     */
    public function enviar(string $telefono, string $mensaje): array;
}
