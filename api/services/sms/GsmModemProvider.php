<?php

declare(strict_types=1);

namespace Api\Services\Sms;

use Api\Core\Env;
use RuntimeException;
use Throwable;

/**
 * Envía SMS a través de un módem GSM/3G USB conectado directamente al
 * servidor (puerto COM en Windows), hablando AT commands. Sin depender
 * de ningún teléfono ni pasarela de terceros: el costo es el de la SIM
 * que le pongas al módem.
 *
 * IMPORTANTE: esta clase se escribió siguiendo la secuencia estándar de
 * comandos AT para envío de SMS en modo texto (documentada y usada por
 * la mayoría de módems GSM/3G), pero no se pudo probar contra un módem
 * físico real en este entorno de desarrollo. Antes de confiar en ella en
 * producción, pruébala con tu módem conectado y ajusta baudios/timeouts
 * si tu modelo particular los necesita distintos.
 */
final class GsmModemProvider implements SmsProviderInterface
{
    private ?string $puerto;
    private string $baudios;
    private string $archivoLock;

    public function __construct()
    {
        $this->puerto = Env::get('GSM_MODEM_PORT');
        $this->baudios = Env::get('GSM_MODEM_BAUD', '9600');
        $this->archivoLock = sys_get_temp_dir() . '/parqueadero_gsm_modem.lock';
    }

    public function enviar(string $telefono, string $mensaje): array
    {
        if (!$this->puerto) {
            return [
                'exito' => false,
                'detalle' => 'Módem GSM no configurado (GSM_MODEM_PORT vacío en api/config/.env, ej: COM3).',
            ];
        }

        if (!preg_match('/^COM\d{1,3}$/i', $this->puerto)) {
            return [
                'exito' => false,
                'detalle' => "GSM_MODEM_PORT inválido: \"{$this->puerto}\" (debe ser un puerto como COM3).",
            ];
        }

        // Solo un envío a la vez: dos notificaciones procesadas casi al
        // mismo tiempo no pueden hablarle al mismo puerto serial a la vez.
        $lock = fopen($this->archivoLock, 'c');
        if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
            return ['exito' => false, 'detalle' => 'El módem GSM está ocupado con otro envío; se reintentará.'];
        }

        try {
            return $this->enviarPorPuerto(TelefonoUtil::formatearColombia($telefono), $mensaje);
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    private function enviarPorPuerto(string $telefono, string $mensaje): array
    {
        // En Windows hay que configurar el puerto (baudios/paridad) antes
        // de poder abrirlo como archivo.
        exec(sprintf('mode %s: BAUD=%s PARITY=N DATA=8 STOP=1 2>&1', $this->puerto, $this->baudios), $salidaModo, $codigoModo);
        if ($codigoModo !== 0) {
            return [
                'exito' => false,
                'detalle' => "No se pudo configurar el puerto {$this->puerto}: " . implode(' ', $salidaModo),
            ];
        }

        $handle = @fopen('\\\\.\\' . $this->puerto, 'r+b');
        if ($handle === false) {
            return [
                'exito' => false,
                'detalle' => "No se pudo abrir el puerto {$this->puerto}. Verifica que el módem esté conectado, "
                    . 'los drivers instalados, y que ningún otro programa lo tenga abierto.',
            ];
        }
        stream_set_blocking($handle, false);

        try {
            $this->comando($handle, "AT\r", 'OK', 3);
            $this->comando($handle, "AT+CMGF=1\r", 'OK', 3);
            $this->comando($handle, "AT+CSCS=\"GSM\"\r", 'OK', 3);

            fwrite($handle, "AT+CMGS=\"{$telefono}\"\r");
            $respuestaPrompt = $this->leerHasta($handle, ['>'], 5);
            if (!str_contains($respuestaPrompt, '>')) {
                throw new RuntimeException("El módem no respondió con el prompt de envío (>). Respuesta: " . trim($respuestaPrompt));
            }

            fwrite($handle, $mensaje . chr(26)); // Ctrl+Z: confirma el envío del mensaje.
            $respuestaFinal = $this->leerHasta($handle, ['+CMGS', 'ERROR'], 15);

            if (str_contains($respuestaFinal, '+CMGS')) {
                return ['exito' => true, 'detalle' => trim($respuestaFinal)];
            }

            return ['exito' => false, 'detalle' => 'El módem rechazó el envío: ' . trim($respuestaFinal)];
        } catch (Throwable $e) {
            return ['exito' => false, 'detalle' => $e->getMessage()];
        } finally {
            fclose($handle);
        }
    }

    /** @param resource $handle */
    private function comando($handle, string $cmd, string $esperado, int $timeoutSeg): string
    {
        fwrite($handle, $cmd);
        $respuesta = $this->leerHasta($handle, [$esperado], $timeoutSeg);
        if (!str_contains($respuesta, $esperado)) {
            throw new RuntimeException("El módem no respondió \"{$esperado}\" a \"{$cmd}\". Respuesta: " . trim($respuesta));
        }
        return $respuesta;
    }

    /**
     * @param resource $handle
     * @param string[] $marcadores
     */
    private function leerHasta($handle, array $marcadores, int $timeoutSeg): string
    {
        $buffer = '';
        $fin = microtime(true) + $timeoutSeg;

        while (microtime(true) < $fin) {
            $chunk = fread($handle, 256);
            if ($chunk !== false && $chunk !== '') {
                $buffer .= $chunk;
                foreach ($marcadores as $marcador) {
                    if (str_contains($buffer, $marcador)) {
                        return $buffer;
                    }
                }
            } else {
                usleep(100000);
            }
        }

        return $buffer;
    }
}
