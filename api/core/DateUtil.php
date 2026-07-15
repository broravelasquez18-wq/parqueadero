<?php

declare(strict_types=1);

namespace Api\Core;

use DateTime;
use DateTimeZone;

final class DateUtil
{
    /** Convierte un ISO 8601 (como los que produce Date#toISOString en JS) a DATETIME de MySQL. */
    public static function toMysql(?string $iso): ?string
    {
        if ($iso === null || $iso === '') {
            return null;
        }
        $dt = new DateTime($iso, new DateTimeZone('UTC'));
        return $dt->format('Y-m-d H:i:s');
    }
}
