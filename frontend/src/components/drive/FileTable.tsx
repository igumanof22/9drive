import { FolderOpen, MoreVertical, Star } from 'lucide-react'
import { type DragEvent, type MouseEvent, useState } from 'react'
import { AccountAvatar } from '@/components/drive/AccountAvatar'
import { PublicBadge } from '@/components/drive/PublicBadge'
import { FileIcon } from '@/components/drive/FileIcon'
import { FolderVisual } from '@/components/drive/FolderVisual'
import type { FileItem, FolderItem } from '@/data/drive-data'
import { apiFetch } from '@/lib/api'
import { getFileType } from '@/lib/file-type'

export function FileTable({ files, folders = [], mode = 'default', selectedFileIds = new Set<string>(), allSelected = false, onFileContextMenu, onToggleFile, onToggleAll, onFileOpen, onToggleStar, onFolderOpen, onFolderMenu, onDropItem }: { files: FileItem[]; folders?: FolderItem[]; mode?: 'default' | 'shared' | 'recent' | 'starred' | 'archived'; selectedFileIds?: Set<string>; allSelected?: boolean; onFileContextMenu?: (event: MouseEvent<HTMLElement>, file: FileItem) => void; onToggleFile?: (file: FileItem) => void; onToggleAll?: () => void; onFileOpen?: (file: FileItem) => void; onToggleStar?: (file: FileItem) => void; onFolderOpen?: (folder: FolderItem) => void; onFolderMenu?: (event: MouseEvent<HTMLElement>, folder: FolderItem) => void; onDropItem?: (fileId: string, folderId: string) => void }) {
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null)

  function allowFileDrop(event: DragEvent<HTMLElement>) {
    if (!onDropItem) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function acceptFileDrop(event: DragEvent<HTMLElement>, folder: FolderItem) {
    event.preventDefault()
    const fileId = event.dataTransfer.getData('text/plain')
    if (fileId && folder.id) onDropItem?.(fileId, folder.id)
  }

  return (
    <div className="mt-4">
      {/* Mobile card view */}
      <div className="grid gap-2.5 sm:hidden">
        {onToggleAll ? (
          <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold shadow-sm">
            <span>Select all files</span>
            <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={allSelected} onChange={onToggleAll} />
          </label>
        ) : null}
        {folders.map((folder) => (
          <article key={`folder-${folder.id ?? folder.name}`} onDragOver={allowFileDrop} onDrop={(event) => acceptFileDrop(event, folder)} onClick={() => onFolderOpen?.(folder)} onContextMenu={(event) => onFolderMenu?.(event, folder)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center gap-3">
              <FolderVisual folder={folder} className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <h3 className="truncate text-sm font-bold leading-snug text-slate-950" title={folder.name}>{folder.name}</h3>
                <p className="mt-1 text-xs text-slate-400">Folder · {folder.updatedAt ?? folder.updated}</p>
                {folder.accountEmail ? <p className="mt-0.5 truncate text-xs text-slate-400" title={folder.accountEmail}>{folder.accountEmail}</p> : null}
              </div>
              <button className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); onFolderMenu?.(event, folder) }} aria-label={`Open ${folder.name} menu`}><MoreVertical className="h-4 w-4" /></button>
            </div>
          </article>
        ))}
        {files.map((file) => {
          const selected = selectedFileIds.has(file.id ?? '')
          const meta = mode === 'archived' ? file.location : mode === 'recent' ? file.openedDate : mode === 'starred' ? file.starredDate : file.date
          return (
            <article key={file.id ?? file.name} draggable onDragStart={(event) => { event.dataTransfer.setData('text/plain', file.id ?? ''); event.dataTransfer.effectAllowed = 'move' }} onClick={() => onToggleFile?.(file)} onDoubleClick={() => onFileOpen?.(file)} onContextMenu={(event) => onFileContextMenu?.(event, file)} className={selected ? 'overflow-hidden rounded-2xl border file-selected p-3.5 shadow-sm cursor-pointer' : 'overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm cursor-pointer'}>
              <div className="flex items-center gap-3">
                {onToggleFile ? <input type="checkbox" className="h-4 w-4 shrink-0 accent-blue-600" checked={selected} onChange={() => onToggleFile?.(file)} onClick={(event) => event.stopPropagation()} /> : null}
                <div className="shrink-0">{mode === 'starred' ? <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" /> : <FileIcon file={file} />}</div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex min-w-0 items-center gap-1.5"><h3 className="truncate text-sm font-bold leading-snug text-slate-950" title={file.name}>{file.name}</h3><PublicBadge role={file.publicRole} sharedPeopleCount={file.sharedPeopleCount} /></div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span>{getFileType(file).label}</span>
                    <span>·</span>
                    <span>{meta}</span>
                    <span>·</span>
                    <span>{file.size}</span>
                    {file.folderName && <><span>·</span><span className="flex items-center gap-0.5 text-blue-500"><FolderOpen className="h-3 w-3" />{file.folderName}</span></>}
                  </div>
                  {file.accountEmail && <p className="mt-0.5 truncate text-xs text-slate-400" title={file.accountEmail}>{file.accountEmail}</p>}
                </div>
                <button className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); onFileContextMenu?.(event, file) }} aria-label={`Open ${file.name} menu`}><MoreVertical className="h-4 w-4" /></button>
              </div>
            </article>
          )
        })}
      </div>

      {/* Desktop table view */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200/20 text-slate-950">
              <th className="w-9 py-2.5"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={allSelected} onChange={onToggleAll} /></th>
              <th className="py-2.5 font-extrabold">Name</th>
              <th className="py-2.5 font-extrabold">Type</th>
              {mode === 'default' ? <th className="py-2.5 font-extrabold text-slate-500 font-semibold">Folder</th> : null}
              {mode === 'shared' ? <th className="py-2.5 font-extrabold">Owner</th> : null}
              {mode === 'recent' ? <th className="py-2.5 font-extrabold">Last Opened</th> : null}
              {mode === 'starred' ? <th className="py-2.5 font-extrabold">Starred On</th> : null}
              {mode === 'archived' ? <th className="py-2.5 font-extrabold">Archived Date</th> : null}
              {mode === 'archived' ? <th className="py-2.5 font-extrabold">Original Location</th> : <th className="py-2.5 font-extrabold">Last Modified</th>}
              <th className="py-2.5 font-extrabold">Size</th>
              <th className="py-2.5 font-extrabold">{mode === 'shared' ? 'Access' : 'Drive Account'}</th>
              <th className="py-2.5" />
            </tr>
          </thead>
          <tbody>
            {/* Folders lead the list, the way a file manager orders them; both groups arrive
                sorted by name from the backend. */}
            {folders.map((folder) => (
              <tr key={`folder-${folder.id ?? folder.name}`} onDragOver={allowFileDrop} onDrop={(event) => acceptFileDrop(event, folder)} onClick={() => onFolderOpen?.(folder)} onContextMenu={(event) => onFolderMenu?.(event, folder)} className="group border-b border-slate-200/10 transition hover:bg-slate-100 cursor-pointer">
                <td className="py-2.5" />
                <td className="py-2.5 font-semibold">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FolderVisual folder={folder} className="h-4 w-4 shrink-0" />
                    <span className="truncate max-w-[200px] lg:max-w-[280px]" title={folder.name}>{folder.name}</span>
                  </span>
                </td>
                <td className="py-2.5 text-slate-500">Folder</td>
                {mode === 'default' ? <td className="py-2.5 text-xs text-slate-300">&mdash;</td> : null}
                <td className="py-2.5 text-slate-500">{folder.updatedAt ?? folder.updated}</td>
                <td className="py-2.5 text-slate-500">&mdash;</td>
                <td className="py-2.5 text-slate-500">{folder.accountEmail ? <span className="flex items-center gap-2"><AccountAvatar email={folder.accountEmail} avatarUrl={folder.accountAvatarUrl} /><span className="truncate max-w-[200px]" title={folder.accountEmail}>{folder.accountEmail}</span></span> : <span className="text-xs text-slate-300">&mdash;</span>}</td>
                <td className="py-2.5 text-right"><button className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 shrink-0 ml-auto" onClick={(event) => { event.stopPropagation(); onFolderMenu?.(event, folder) }} aria-label={`Open ${folder.name} menu`}><MoreVertical className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {files.map((file) => (
              <tr key={file.id ?? file.name} draggable onDragStart={(event) => { event.dataTransfer.setData('text/plain', file.id ?? ''); event.dataTransfer.effectAllowed = 'move' }} onContextMenu={(event) => onFileContextMenu?.(event, file)} onClick={() => onToggleFile?.(file)} onDoubleClick={() => onFileOpen?.(file)} className={selectedFileIds.has(file.id ?? '') ? 'group border-b file-selected transition hover:bg-orange-500/15 cursor-pointer' : 'group border-b border-slate-200/10 transition hover:bg-slate-100 cursor-pointer'}>
                <td className="py-2.5"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={selectedFileIds.has(file.id ?? '')} onChange={() => onToggleFile?.(file)} onClick={(event) => event.stopPropagation()} /></td>
                <td className="py-2.5 font-semibold">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {mode === 'starred' && onToggleStar ? (
                      <button type="button" title="Remove from Starred" aria-label={`Remove ${file.name} from Starred`} onClick={(event) => { event.stopPropagation(); onToggleStar(file) }} className="shrink-0 rounded-md p-0.5 hover:bg-slate-100">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      </button>
                    ) : mode === 'starred' ? <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" /> : <FileIcon file={file} />}
                    <span className="truncate max-w-[200px] lg:max-w-[280px]" title={file.name}>{file.name}</span>
                    <PublicBadge role={file.publicRole} sharedPeopleCount={file.sharedPeopleCount} />
                  </span>
                </td>
                <td className="py-2.5 text-slate-500">{getFileType(file).label}</td>
                {/* Folder path column — only in default mode */}
                {mode === 'default' ? (
                  <td className="py-2.5 text-slate-400">
                    {file.folderName ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-blue-500">
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-[120px]">{file.folderName}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                ) : null}
                {mode === 'shared' ? <td className="py-2.5 text-slate-500">{file.owner}</td> : null}
                {mode === 'recent' ? <td className="py-2.5 text-slate-500">{file.openedDate}</td> : null}
                {mode === 'starred' ? <td className="py-2.5 text-slate-500">{file.starredDate}</td> : null}
                {mode === 'archived' ? <td className="py-2.5 text-slate-500">{file.archivedDate}</td> : null}
                <td className="py-2.5 text-slate-500">{mode === 'archived' ? file.location : file.date}</td>
                <td className="py-2.5 text-slate-500">{file.size}</td>
                <td className="py-2.5 text-slate-500"><span className="flex items-center gap-2"><AccountAvatar email={file.accountEmail} avatarUrl={file.accountAvatarUrl} /><span className="truncate max-w-[200px]" title={file.access}>{file.access}</span></span></td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Hover shortcuts */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex gap-1.5">
                      <button
                        title="Copy Link"
                        onClick={async (event) => {
                          event.stopPropagation()
                          try {
                            // Always the 9Drive link: it works for the recipient without
                            // making the file public on Drive, and it can be revoked later.
                            const shareData = await apiFetch<{ url: string }>(`/files/${file.id}/share`, { method: 'POST' })
                            await navigator.clipboard.writeText(shareData.url)
                            setCopiedFileId(file.id ?? null)
                            setTimeout(() => setCopiedFileId(null), 2000)
                          } catch { /* ignore */ }
                        }}
                        className={
                          copiedFileId === file.id
                            ? "inline-flex h-7 px-2 items-center justify-center rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all scale-95"
                            : "inline-flex h-7 px-2 items-center justify-center rounded-lg text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                        }
                      >
                        {copiedFileId === file.id ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button
                        title="Move File"
                        onClick={(event) => {
                          event.stopPropagation()
                          window.dispatchEvent(new CustomEvent('9drive:open-move-modal', { detail: file }))
                        }}
                        className="inline-flex h-7 px-2 items-center justify-center rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        Move
                      </button>
                    </div>
                    <button className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 shrink-0" onClick={(event) => { event.stopPropagation(); onFileContextMenu?.(event, file) }} aria-label={`Open ${file.name} menu`}><MoreVertical className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
