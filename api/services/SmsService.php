<?php

declare(strict_types=1);

namespace Api\Services;

use Api\Core\Env;
use Api\Services\Sms\AndroidGatewayProvider;
use Api\Services\Sms\GsmModemProvider;
use Api\Services\Sms\HablameProvider;
use Api\Services\Sms\SmsProviderInterface;
use Api\Services\Sms\TwilioProvider;
use RuntimeException;

/** Fachada: elige el proveedor de SMS activo según SMS_PROVIDER en .env. */
final class SmsService
{
    private SmsProviderInterface $proveedor;

    public function __construct()
    {
        $nombre = Env::get('SMS_PROVIDER', 'twilio');

        $this->proveedor = match ($nombre) {
            'twilio' => new TwilioProvider(),
            'hablame' => new HablameProvider(),
            'android' => new AndroidGatewayProvider(),
            'gsm' => new GsmModemProvider(),
            default => throw new RuntimeException("Proveedor de SMS desconocido en SMS_PROVIDER: {$nombre}"),
        };
    }

    /** @return array{exito: bool, detalle: string} */
    public function enviar(string $telefono, string $mensaje): array
    {
        return $this->proveedor->enviar($telefono, $mensaje);
    }
}
