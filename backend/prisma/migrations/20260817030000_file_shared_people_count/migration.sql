-- Link sharing was already visible in the listing; per-person sharing was not, so a file
-- could be shared with someone and still look private. The count is kept per file so the
-- listing does not have to ask Drive about permissions row by row.
ALTER TABLE `files` ADD COLUMN `shared_people_count` INT NOT NULL DEFAULT 0;
