import { MoreVertical } from 'lucide-react'
import { AccountAvatar } from '@/components/drive/AccountAvatar'
import { PublicBadge } from '@/components/drive/PublicBadge'
import { useState, type MouseEvent } from 'react'
import { Card } from '@/components/ui/card'
import { FileIcon } from '@/components/drive/FileIcon'
import type { FileItem } from '@/data/drive-data'
import { cn } from '@/lib/utils'
import { getFileType } from '@/lib/file-type'

export type FileSizeScale = 'xs' | 'sm' | 'md' | 'lg'

// The scale picker sets how many tiles fit across, which is what decides thumbnail size.
// md is the 8-column default; the others step around it.
const scaleConfig: Record<FileSizeScale, { grid: string; title: string; meta: string; showMeta: boolean; showAccount: boolean; icon: string }> = {
  xs: { grid: 'grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 xl:grid-cols-12', title: 'text-[10px]', meta: 'text-[9px]', showMeta: false, showAccount: false, icon: 'h-7 w-7 rounded-lg p-1.5' },
  sm: { grid: 'grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-10', title: 'text-[11px]', meta: 'text-[9px]', showMeta: true, showAccount: false, icon: 'h-8 w-8 rounded-lg p-2' },
  md: { grid: 'grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8', title: 'text-xs', meta: 'text-[10px]', showMeta: true, showAccount: true, icon: 'h-10 w-10 rounded-xl p-2.5' },
  lg: { grid: 'grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5', title: 'text-[13px]', meta: 'text-[11px]', showMeta: true, showAccount: true, icon: 'h-14 w-14 rounded-2xl p-3' },
}

export function FileGrid({
  files,
  selectedFileIds = new Set<string>(),
  sizeScale = 'md',
  onFileContextMenu,
  onToggleFile,
  onFileOpen
}: {
  files: FileItem[]
  selectedFileIds?: Set<string>
  sizeScale?: FileSizeScale
  onFileContextMenu?: (event: MouseEvent<HTMLElement>, file: FileItem) => void
  onToggleFile?: (file: FileItem) => void
  onFileOpen?: (file: FileItem) => void
}) {
  const cfg = scaleConfig[sizeScale]
  // Drive's thumbnail URLs are signed and expire, so a stale one has to fall back to the icon
  // instead of leaving a broken image in the tile.
  const [brokenThumbnails, setBrokenThumbnails] = useState<Set<string>>(new Set())

  return (
    <div className={cn('mt-5 grid', cfg.grid)}>
      {files.map((file) => {
        const selected = selectedFileIds.has(file.id ?? '')
        const type = getFileType(file)
        const thumbnail = file.thumbnailUrl && !brokenThumbnails.has(file.id ?? '') ? file.thumbnailUrl : null
        return (
          <Card
            key={file.id ?? file.name}
            draggable
            onDragStart={(event) => { event.dataTransfer.setData('text/plain', file.id ?? ''); event.dataTransfer.effectAllowed = 'move' }}
            onClick={() => onToggleFile?.(file)}
            onDoubleClick={() => onFileOpen?.(file)}
            onContextMenu={(event) => onFileContextMenu?.(event, file)}
            className={cn(
              'group relative cursor-pointer overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-md',
              selected && 'file-selected shadow-sm',
            )}
          >
            <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                  onError={() => setBrokenThumbnails((current) => new Set(current).add(file.id ?? ''))}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <FileIcon file={file} className={cfg.icon} />
                </span>
              )}

              <input
                type="checkbox"
                className="absolute left-1.5 top-1.5 h-4 w-4 accent-blue-600 opacity-0 transition-opacity group-hover:opacity-100 checked:opacity-100"
                checked={selected}
                onChange={() => onToggleFile?.(file)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Select ${file.name}`}
              />
              <button
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-slate-600 opacity-0 backdrop-blur transition-opacity hover:bg-white group-hover:opacity-100 dark:bg-slate-900/80 dark:text-slate-300"
                onClick={(event) => { event.stopPropagation(); onFileContextMenu?.(event, file) }}
                aria-label={`Open ${file.name} menu`}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {/* The account badge sits on the thumbnail so it survives even at the smallest
                  scale, where there is no room for a text line under the tile. */}
              {file.accountEmail ? (
                <span className="absolute bottom-1.5 right-1.5 rounded-full ring-2 ring-white/80 dark:ring-slate-900/80">
                  <AccountAvatar email={file.accountEmail} avatarUrl={file.accountAvatarUrl} />
                </span>
              ) : null}
            </div>

            <div className="min-w-0 px-2 py-1.5">
              <p className={cn('truncate font-bold text-slate-950', cfg.title)} title={file.name}>{file.name}</p>
              {/* Below the thumbnail rather than on top of it: a tile is barely wider than the
                  badge itself, and over a photo the mark was easy to miss entirely. */}
              {file.publicRole || (file.sharedPeopleCount ?? 0) > 0 ? (
                <span className="mt-1 flex flex-wrap items-center gap-1"><PublicBadge role={file.publicRole} sharedPeopleCount={file.sharedPeopleCount} /></span>
              ) : null}
              {cfg.showMeta ? <p className={cn('truncate text-slate-500', cfg.meta)}>{type.label} · {file.size}</p> : null}
              {cfg.showAccount && file.accountEmail ? <p className={cn('truncate text-slate-400', cfg.meta)} title={file.accountEmail}>{file.accountEmail}</p> : null}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
