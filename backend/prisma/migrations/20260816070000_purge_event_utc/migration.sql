-- Back to a UTC server, so schedule in UTC again: 18:00 UTC is 01:00 in Asia/Jakarta.
DROP EVENT IF EXISTS `purge_disabled_file_shares`;

CREATE EVENT `purge_disabled_file_shares`
  ON SCHEDULE EVERY 1 DAY
  STARTS TIMESTAMP(CURRENT_DATE, '18:00:00') + INTERVAL 1 DAY
  ON COMPLETION PRESERVE
  COMMENT 'Delete revoked or expired file share tokens (01:00 Asia/Jakarta)'
  DO
    DELETE FROM `file_shares`
    WHERE `enabled` = 0
       OR (`expires_at` IS NOT NULL AND `expires_at` < UTC_TIMESTAMP());
