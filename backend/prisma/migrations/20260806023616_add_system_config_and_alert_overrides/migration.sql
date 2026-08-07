-- CreateTable
CREATE TABLE `system_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(50) NOT NULL,
    `value` JSON NOT NULL,

    UNIQUE INDEX `system_config_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `motor_alert_overrides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_id` INTEGER NOT NULL,
    `alarm_consecutive_readings` INTEGER NOT NULL,
    `alarm_grace_period_ms` INTEGER NOT NULL,
    `post_restart_cooldown_ms` INTEGER NOT NULL,
    `max_auto_restarts` INTEGER NOT NULL,

    UNIQUE INDEX `motor_alert_overrides_motor_id_key`(`motor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `motor_alert_overrides` ADD CONSTRAINT `motor_alert_overrides_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
