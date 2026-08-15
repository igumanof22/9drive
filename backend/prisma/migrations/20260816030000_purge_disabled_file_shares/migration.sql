-- Revoked and expired share links pile up forever; nothing ever read them again.
-- Runs daily at 18:00 UTC, which is 01:00 in Asia/Jakarta.
-- UTC_TIMESTAMP() is deliberate: the app writes timestamps in UTC, and the server
-- runs in UTC too, so comparing against NOW() would silently drift if either moves.
CREATE EVENT IF NOT EXISTS `purge_disabled_file_shares`
  ON SCHEDULE EVERY 1 DAY
  STARTS TIMESTAMP(CURRENT_DATE, '18:00:00') + INTERVAL 1 DAY
  ON COMPLETION PRESERVE
  COMMENT 'Delete revoked or expired file share tokens'
  DO
    DELETE FROM `file_shares`
    WHERE `enabled` = 0
       OR (`expires_at` IS NOT NULL AND `expires_at` < UTC_TIMESTAMP());
