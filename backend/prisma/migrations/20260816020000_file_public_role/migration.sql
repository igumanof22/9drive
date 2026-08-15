-- Records the link-level access a file currently has on Google Drive:
-- NULL means private, otherwise the role granted to "anyone with the link".
ALTER TABLE `files` ADD COLUMN `public_role` VARCHAR(16) NULL;
