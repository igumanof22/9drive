-- Starring is a 9Drive-side marker: Drive has its own "starred" flag, but it is per Google
-- account and not exposed through the scopes this app asks for, so the pin lives here.
ALTER TABLE `files` ADD COLUMN `starred_at` DATETIME(3) NULL;

CREATE INDEX `files_user_id_status_starred_at_idx` ON `files`(`user_id`, `status`, `starred_at`);
