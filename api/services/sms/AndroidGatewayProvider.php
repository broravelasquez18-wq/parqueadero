<?php

declare(strict_types=1);

namespace Api\Services\Sms;

use Api\Core\Env;

/**
 * Envía SMS a través de la app "SMS Gateway for Android™" (proyecto
 * open-source capcom6/android-sms-gateway) corriendo en modo "Local
 * Server" en un teléfono con SIM propia, en la misma red local que el
 * servidor. Sin límite diario ni verificación de identidad de terceros:
 * el costo es el que ya pagas por tu plan de SMS del celular.
 *
 * Configuración en el teléfono: instalar la app, activar "Local Server",
 * definir usuario/contraseña ahí mismo, y anotar la IP local que muestra
 * la app (ej. 192.168.1.50). Documentación: https://docs.sms-gate.app/
 */
final class AndroidGatewayProvider implements SmsProviderInterface
{
    private ?string $baseUrl;
    private ?string $usuario;
    private ?string $password;

    public function __construct()
    {
        $this->baseUrl = Env::get('ANDROID_GATEWAY_URL');
        $this->usuario = Env::get('ANDROID_GATEWAY_USER');
        $this->password = Env::get('ANDROID_GATEWAY_PASSWORD');
    }

    public function enviar(string $telefono, string $mensaje): array
    {
        if (!$this->baseUrl || !$this->usuario || !$this->password) {
            return [
                'exito' => false,
                'detalle' => 'Gateway Android no configurado '
                    . '(ANDROID_GATEWAY_URL / ANDROID_GATEWAY_USER / ANDROID_GATEWAY_PASSWORD vacíos en api/config/.env).',
            ];
        }

        $url = rtrim($this->baseUrl, '/') . '/message';
        $to = TelefonoUtil::formatearColombia($telefono);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode([
                'textMessage' => ['text' => $mensaje],
                'phoneNumbers' => [$to],
            ]),
            CURLOPT_USERPWD => $this->usuario . ':' . $this->password,
            // Es un teléfono en la red local: si no responde rápido, probablemente
            // está apagado o sin la app abierta; no vale la pena esperar mucho.
            CURLOPT_TIMEOUT => 8,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);

        $cuerpoRespuesta = curl_exec($ch);
        $errno = curl_errno($ch);
        $errorTexto = curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            return [
                'exito' => false,
                'detalle' => "No se pudo contactar el teléfono gateway ({$this->baseUrl}): {$errorTexto}. "
                    . 'Verifica que esté encendido, con la app abierta y en la misma red.',
            ];
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            return ['exito' => true, 'detalle' => (string) $cuerpoRespuesta];
        }

        return ['exito' => false, 'detalle' => "El gateway Android respondió HTTP {$httpCode}: {$cuerpoRespuesta}"];
    }
}
