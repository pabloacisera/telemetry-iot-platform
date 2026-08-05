/*
  Warnings:

  - A unique constraint covering the columns `[jti]` on the table `refresh_tokens` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `alerts` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `motor_sensors` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `motors` ADD COLUMN `alarm_consecutive_readings` INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN `alarm_grace_period_ms` INTEGER NOT NULL DEFAULT 120000,
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `refresh_tokens` ADD COLUMN `jti` VARCHAR(36) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `refresh_tokens_jti_key` ON `refresh_tokens`(`jti`);
