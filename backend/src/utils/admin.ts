// Single-admin gate for instance-wide settings (Google OAuth credentials).
// ADMIN_EMAIL unset keeps the original behaviour: every signed-in user may manage them.
export function isAdminEmail(email: string | null | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (!adminEmail) return true
  return email?.trim().toLowerCase() === adminEmail
}
