import { useState } from 'react'

/** Shows the Google profile picture of the Drive account a file lives in.
 *  Falls back to the account initial when there is no picture, or when the
 *  Google CDN fails to serve it. */
export function AccountAvatar({ email, avatarUrl }: { email?: string; avatarUrl?: string }) {
  const [failed, setFailed] = useState(false)
  const initial = (email ?? '?').trim().charAt(0).toUpperCase()

  if (!avatarUrl || failed) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white"
        title={email}
      >
        {initial}
      </span>
    )
  }

  return (
    <img
      src={avatarUrl}
      alt=""
      title={email}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-5 w-5 shrink-0 rounded-full object-cover"
    />
  )
}
