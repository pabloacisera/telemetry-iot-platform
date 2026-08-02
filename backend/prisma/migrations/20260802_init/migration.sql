-- CreateTable
CREATE TABLE `motors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `location` VARCHAR(100) NULL,
    `rated_current_a` DOUBLE NOT NULL,
    `insulation_class` VARCHAR(1) NOT NULL DEFAULT 'F',
    `connection_type` VARCHAR(4) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'healthy',
    `status_changed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `motors_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensor_standards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sensor_type` VARCHAR(20) NOT NULL,
    `standard_name` VARCHAR(100) NOT NULL,
    `unit` VARCHAR(10) NOT NULL,
    `plausible_min` DOUBLE NOT NULL,
    `plausible_max` DOUBLE NOT NULL,
    `default_healthy_max` DOUBLE NOT NULL,
    `default_warning_max` DOUBLE NOT NULL,
    `default_critical_max` DOUBLE NOT NULL,
    `source_reference` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `motor_sensors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_id` INTEGER NOT NULL,
    `sensor_type` VARCHAR(20) NOT NULL,
    `healthy_max` DOUBLE NOT NULL,
    `warning_max` DOUBLE NOT NULL,
    `critical_max` DOUBLE NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'ok',
    `status_changed_at` DATETIME(3) NULL,
    `last_value` DOUBLE NULL,
    `last_reading_at` DATETIME(3) NULL,

    UNIQUE INDEX `motor_sensors_motor_id_sensor_type_key`(`motor_id`, `sensor_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `readings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `motor_sensor_id` INTEGER NOT NULL,
    `value` DOUBLE NOT NULL,
    `is_anomalous` BOOLEAN NOT NULL DEFAULT false,
    `is_implausible` BOOLEAN NOT NULL DEFAULT false,
    `recorded_at` DATETIME(3) NOT NULL,

    INDEX `readings_motor_sensor_id_recorded_at_idx`(`motor_sensor_id`, `recorded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `readings_hourly_agg` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `motor_sensor_id` INTEGER NOT NULL,
    `hour_bucket` DATETIME(3) NOT NULL,
    `avg_value` DOUBLE NULL,
    `min_value` DOUBLE NULL,
    `max_value` DOUBLE NULL,
    `anomaly_count` INTEGER NOT NULL DEFAULT 0,
    `fault_count` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `readings_hourly_agg_motor_sensor_id_hour_bucket_key`(`motor_sensor_id`, `hour_bucket`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_id` INTEGER NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `triggered_at` DATETIME(3) NOT NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolved_by` INTEGER NULL,
    `resolution_note` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensor_faults` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_sensor_id` INTEGER NOT NULL,
    `fault_type` VARCHAR(20) NOT NULL,
    `detected_at` DATETIME(3) NOT NULL,
    `auto_restarted_at` DATETIME(3) NULL,
    `resolved_at` DATETIME(3) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'active',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `motor_status_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_id` INTEGER NOT NULL,
    `from_status` VARCHAR(30) NULL,
    `to_status` VARCHAR(30) NULL,
    `changed_at` DATETIME(3) NOT NULL,
    `changed_by` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `retention_job_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `run_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `partitions_created` INTEGER NOT NULL DEFAULT 0,
    `partitions_aggregated` INTEGER NOT NULL DEFAULT 0,
    `partitions_dropped` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `motor_sensors` ADD CONSTRAINT `motor_sensors_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_faults` ADD CONSTRAINT `sensor_faults_motor_sensor_id_fkey` FOREIGN KEY (`motor_sensor_id`) REFERENCES `motor_sensors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `motor_status_history` ADD CONSTRAINT `motor_status_history_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

