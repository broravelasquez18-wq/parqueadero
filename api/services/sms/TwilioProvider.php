<?php

declare(strict_types=1);

namespace Api\Services\Sms;

use Api\Core\Env;

final class TwilioProvider implements SmsProviderInterface
{
    private const URL_BASE = 'https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json';

    private ?string $accountSid;
    private ?string $authToken;
    private ?string $fromNumber;

    public function __construct()
    {
        $this->accountSid = Env::get('TWILIO_ACCOUNT_SID');
        $this->authToken = Env::get('TWILIO_AUTH_TOKEN');
        $this->fromNumber = Env::get('TWILIO_FROM_NUMBER');
    }

    public function enviar(string $telefono, string $mensaje): array
    {
        if (!$this->accountSid || !$this->authToken || !$this->fromNumber) {
            return [
                'exito' => false,
                'detalle' => 'Credenciales de Twilio no configuradas '
                    . '(TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER vacíos en api/config/.env).',
            ];
        }

        $url = sprintf(self::URL_BASE, $this->accountSid);
        $to = TelefonoUtil::formatearColombia($telefono);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'To' => $to,
                'From' => $this->fromNumber,
                'Body' => $mensaje,
            ]),
            CURLOPT_USERPWD => $this->accountSid . ':' . $this->authToken,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);

        $cuerpoRespuesta = curl_exec($ch);
        $errno = curl_errno($ch);
        $errorTexto = curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            return ['exito' => false, 'detalle' => "Error de conexión con Twilio: {$errorTexto}"];
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            return ['exito' => true, 'detalle' => (string) $cuerpoRespuesta];
        }

        return ['exito' => false, 'detalle' => "Twilio respondió HTTP {$httpCode}: {$cuerpoRespuesta}"];
    }
}
