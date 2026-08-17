import { Globe, Pencil, Users } from 'lucide-react'
import type { FileItem } from '@/data/drive-data'

const roleLabels: Record<string, string> = {
  reader: 'Anyone with the link can view this file',
  commenter: 'Anyone with the link can comment on this file',
  writer: 'Anyone with the link can edit or delete this file',
}

const badgeBase = 'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide'

/** Marks a file that is no longer private, so a shared file is never a surprise.
 *  Link sharing and per-person sharing are separate marks: revoking one leaves the other
 *  in place, so collapsing them into a single badge would misreport who can reach the file.
 *  Edit access is called out in red because it is the one that can destroy data. */
export function PublicBadge({ role, sharedPeopleCount = 0 }: { role: FileItem['publicRole']; sharedPeopleCount?: number }) {
  if (!role && sharedPeopleCount <= 0) return null
  const editable = role === 'writer'
  const Icon = editable ? Pencil : Globe

  return (
    <>
      {role ? (
        <span
          title={roleLabels[role] ?? 'Shared by link'}
          className={`${badgeBase} ${editable
            ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}
        >
          <Icon className="h-3 w-3" />
          {editable ? 'Public edit' : role === 'commenter' ? 'Public comment' : 'Public'}
        </span>
      ) : null}
      {sharedPeopleCount > 0 ? (
        <span
          title={`Shared with ${sharedPeopleCount} ${sharedPeopleCount === 1 ? 'person' : 'people'} on Google Drive`}
          className={`${badgeBase} bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300`}
        >
          <Users className="h-3 w-3" />
          {sharedPeopleCount}
        </span>
      ) : null}
    </>
  )
}
