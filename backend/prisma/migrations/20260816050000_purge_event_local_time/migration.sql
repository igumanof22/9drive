-- The server clock is now +07:00 and stored timestamps were shifted to match, so the
-- purge event schedules against local time and compares with NOW() instead of UTC.
DROP EVENT IF EXISTS `purge_disabled_file_shares`;

CREATE EVENT `purge_disabled_file_shares`
  ON SCHEDULE EVERY 1 DAY
  STARTS TIMESTAMP(CURRENT_DATE, '01:00:00') + INTERVAL 1 DAY
  ON COMPLETION PRESERVE
  COMMENT 'Delete revoked or expired file share tokens'
  DO
    DELETE FROM `file_shares`
    WHERE `enabled` = 0
       OR (`expires_at` IS NOT NULL AND `expires_at` < NOW());
