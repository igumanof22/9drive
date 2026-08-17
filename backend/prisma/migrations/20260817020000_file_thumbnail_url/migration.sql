-- Drive hands out a signed thumbnail URL per file. Storing it lets the grid show real
-- previews without this server proxying image bytes for every tile.
ALTER TABLE `files` ADD COLUMN `thumbnail_url` TEXT NULL;
