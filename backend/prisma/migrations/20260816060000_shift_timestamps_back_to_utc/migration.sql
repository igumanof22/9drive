-- Storing local time turned out to be wrong for this stack: Prisma reads DATETIME as UTC
-- and the browser converts it to local time again, so timestamps showed 7 hours ahead.
-- Move the values back to UTC, which is what the read path already assumes.
UPDATE `api_keys` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `expires_at` = `expires_at` - INTERVAL 7 HOUR,
    `last_used_at` = `last_used_at` - INTERVAL 7 HOUR,
    `revoked_at` = `revoked_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `audit_logs` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR;

UPDATE `auth_handoffs` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `expires_at` = `expires_at` - INTERVAL 7 HOUR,
    `used_at` = `used_at` - INTERVAL 7 HOUR;

UPDATE `connected_accounts` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `token_expires_at` = `token_expires_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `file_preview_tokens` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `expires_at` = `expires_at` - INTERVAL 7 HOUR;

UPDATE `file_shares` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `expires_at` = `expires_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `files` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `deleted_at` = `deleted_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `folders` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `deleted_at` = `deleted_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `oauth_states` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `expires_at` = `expires_at` - INTERVAL 7 HOUR,
    `used_at` = `used_at` - INTERVAL 7 HOUR;

UPDATE `provider_configs` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `s3_storage_configs` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `storage_accounts` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `last_synced_at` = `last_synced_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `upload_routing_policies` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `upload_sessions` SET
    `completed_at` = `completed_at` - INTERVAL 7 HOUR,
    `created_at` = `created_at` - INTERVAL 7 HOUR;

UPDATE `user_sessions` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `expires_at` = `expires_at` - INTERVAL 7 HOUR,
    `revoked_at` = `revoked_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `users` SET
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;

UPDATE `workspace_invites` SET
    `accepted_at` = `accepted_at` - INTERVAL 7 HOUR,
    `created_at` = `created_at` - INTERVAL 7 HOUR,
    `revoked_at` = `revoked_at` - INTERVAL 7 HOUR,
    `updated_at` = `updated_at` - INTERVAL 7 HOUR;
