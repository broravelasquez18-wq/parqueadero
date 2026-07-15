-- Sistema de Registro de Parqueadero de Motos
-- Base de datos central (MySQL 8, utf8mb4)

CREATE DATABASE IF NOT EXISTS parqueadero_db
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE parqueadero_db;

-- =========================================================
-- usuarios (dueño del parqueadero / administrador)
-- =========================================================
CREATE TABLE usuarios (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre        VARCHAR(120)        NOT NULL,
    usuario       VARCHAR(60)         NOT NULL,
    password_hash VARCHAR(255)        NOT NULL,
    rol           VARCHAR(30)         NOT NULL DEFAULT 'ADMIN',
    activo        TINYINT(1)          NOT NULL DEFAULT 1,
    created_at    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_usuarios_usuario (usuario)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =========================================================
-- propietarios (cédula como PK natural)
-- =========================================================
CREATE TABLE propietarios (
    cedula      VARCHAR(20)  NOT NULL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    telefono    VARCHAR(20)  NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =========================================================
-- motos (id UUID; placa única pero permite NULL para motos sin placa)
-- =========================================================
CREATE TABLE motos (
    id                  CHAR(36)     NOT NULL PRIMARY KEY,
    placa               VARCHAR(8)   NULL,
    marca               VARCHAR(60)  NULL,
    color               VARCHAR(40)  NULL,
    descripcion         VARCHAR(160) NULL,
    cedula_propietario  VARCHAR(20)  NOT NULL,
    foto_url            VARCHAR(255) NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_motos_placa (placa),
    KEY idx_motos_cedula (cedula_propietario),
    CONSTRAINT fk_motos_propietario FOREIGN KEY (cedula_propietario)
        REFERENCES propietarios (cedula)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =========================================================
-- registros (ingresos/salidas de motos; id UUID)
-- =========================================================
CREATE TABLE registros (
    id             CHAR(36)     NOT NULL PRIMARY KEY,
    moto_id        CHAR(36)     NOT NULL,
    usuario_id     INT UNSIGNED NULL,
    hora_ingreso   DATETIME     NOT NULL,
    hora_salida    DATETIME     NULL,
    valor_cobrado  DECIMAL(10,2) NULL,
    estado         ENUM('EN_PARQUEADERO','RETIRADA') NOT NULL DEFAULT 'EN_PARQUEADERO',
    sync_status    ENUM('PENDIENTE','SINCRONIZADO') NOT NULL DEFAULT 'PENDIENTE',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_registros_moto (moto_id),
    KEY idx_registros_estado (moto_id, estado),
    CONSTRAINT fk_registros_moto FOREIGN KEY (moto_id)
        REFERENCES motos (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_registros_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Nota: MySQL no soporta índices únicos parciales/filtrados, por lo que la
-- regla "una moto no puede tener dos registros EN_PARQUEADERO a la vez"
-- se valida en la capa de aplicación (IndexedDB en el navegador y
-- SyncService.php en el servidor), no con una restricción de esquema.

-- =========================================================
-- tarifas (la vigente es la de fecha_inicio más reciente)
-- Cobro plano: valor_hora es el único valor que se cobra por moto, sin
-- importar el tiempo que esté parqueada. valor_fraccion y minutos_gracia
-- quedan en 0 (se conservan en el esquema por si el negocio vuelve a un
-- modelo por horas en el futuro, pero calculo.js hoy no los usa).
-- =========================================================
CREATE TABLE tarifas (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    valor_hora      DECIMAL(10,2) NOT NULL,
    valor_fraccion  DECIMAL(10,2) NOT NULL,
    minutos_gracia  INT UNSIGNED  NOT NULL DEFAULT 0,
    fecha_inicio    DATETIME      NOT NULL,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tarifas_fecha_inicio (fecha_inicio)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =========================================================
-- notificaciones (cola de SMS; id UUID)
-- =========================================================
CREATE TABLE notificaciones (
    id             CHAR(36)     NOT NULL PRIMARY KEY,
    registro_id    CHAR(36)     NOT NULL,
    tipo           ENUM('INGRESO','SALIDA') NOT NULL,
    telefono       VARCHAR(20)  NOT NULL,
    mensaje        VARCHAR(320) NOT NULL,
    estado         ENUM('PENDIENTE','ENVIADO','FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
    intentos       INT UNSIGNED NOT NULL DEFAULT 0,
    respuesta_api  TEXT NULL,
    sent_at        DATETIME NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_notificaciones_estado (estado),
    KEY idx_notificaciones_registro (registro_id),
    CONSTRAINT fk_notificaciones_registro FOREIGN KEY (registro_id)
        REFERENCES registros (id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =========================================================
-- Datos semilla
-- =========================================================

-- Tarifa plana: $8.000 fijos por moto, sin importar cuánto tiempo esté
-- parqueada (valor_fraccion y minutos_gracia quedan en 0, no se usan).
INSERT INTO tarifas (valor_hora, valor_fraccion, minutos_gracia, fecha_inicio)
VALUES (8000.00, 0.00, 0, '2026-01-01 00:00:00');

-- Usuario administrador de ejemplo.
-- usuario: admin / contraseña: admin123
-- Hash generado con password_hash('admin123', PASSWORD_DEFAULT) en PHP 8.2.
INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo)
VALUES (
    'Administrador',
    'admin',
    '$2y$10$h2OHFY/YeVUlggxJyaeecOfr9eNgz06LvRWa0H/jfq539KbyxxlM2',
    'ADMIN',
    1
);
