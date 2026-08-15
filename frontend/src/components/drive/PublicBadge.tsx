import { Globe, Pencil } from 'lucide-react'
import type { FileItem } from '@/data/drive-data'

const roleLabels: Record<string, string> = {
  reader: 'Anyone with the link can view this file',
  commenter: 'Anyone with the link can comment on this file',
  writer: 'Anyone with the link can edit or delete this file',
}

/** Marks a file that is no longer private, so a shared file is never a surprise.
 *  Edit access is called out in red because it is the one that can destroy data. */
export function PublicBadge({ role }: { role: FileItem['publicRole'] }) {
  if (!role) return null
  const editable = role === 'writer'
  const Icon = editable ? Pencil : Globe

  return (
    <span
      title={roleLabels[role] ?? 'Shared by link'}
      className={
        editable
          ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/40 dark:text-red-300'
          : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
      }
    >
      <Icon className="h-3 w-3" />
      {editable ? 'Public edit' : role === 'commenter' ? 'Public comment' : 'Public'}
    </span>
  )
}
