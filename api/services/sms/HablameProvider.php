<?php

declare(strict_types=1);

namespace Api\Services\Sms;

/**
 * Placeholder para Hablame.co (pasarela colombiana alternativa a Twilio).
 * Deliberadamente NO implementado todavía: no se tiene acceso verificado
 * a la documentación de su API para integrarlo con confianza. Cuando se
 * tenga la cuenta y el contrato de la API, se implementa igual que
 * TwilioProvider e ya funciona con solo cambiar SMS_PROVIDER=hablame en
 * .env, sin tocar el resto del código (SmsService, NotificacionService).
 */
final class HablameProvider implements SmsProviderInterface
{
    public function enviar(string $telefono, string $mensaje): array
    {
        return [
            'exito' => false,
            'detalle' => 'El proveedor Hablame.co aún no está implementado. Usa SMS_PROVIDER=twilio en api/config/.env.',
        ];
    }
}
