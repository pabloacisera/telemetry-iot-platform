-- AlterTable
ALTER TABLE `motors` ADD COLUMN `max_auto_restarts` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `post_restart_cooldown_ms` INTEGER NOT NULL DEFAULT 60000;
