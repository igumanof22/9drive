import { ClipboardPaste, FolderPlus, Upload } from 'lucide-react'
import { useAnchoredMenu } from '@/lib/menu-position'

type Props = {
  x: number
  y: number
  open: boolean
  canPasteFolder?: boolean
  onClose: () => void
  onUpload: () => void
  onCreateFolder: () => void
  onPasteFolder?: () => void
}

function MenuItem({ icon: Icon, label, onClick, accent = false }: { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all duration-150',
        accent
          ? 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70',
      ].join(' ')}
    >
      <span className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
        accent
          ? 'bg-blue-50 text-blue-500 group-hover:bg-blue-100 dark:bg-blue-950/30'
          : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:shadow-sm dark:bg-slate-800 dark:text-slate-400',
      ].join(' ')}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

export function EmptyAreaContextMenu({ x, y, open, canPasteFolder = false, onClose, onUpload, onCreateFolder, onPasteFolder }: Props) {
  const { ref, style } = useAnchoredMenu(x, y)
  if (!open) return null

  return (
    <>
      <button
        className="fixed inset-0 z-40 cursor-default"
        aria-label="Close empty area menu"
        onClick={onClose}
      />
      <div
        ref={ref}
        className="fixed z-50 max-h-[calc(100dvh-1.5rem)] w-52 overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/95 shadow-2xl shadow-slate-950/15 backdrop-blur-2xl dark:border-slate-800/70 dark:bg-slate-900/95"
        style={style}
      >
        <div className="p-1.5">
          <MenuItem icon={Upload} label="Upload File" onClick={onUpload} accent />
          <MenuItem icon={FolderPlus} label="New Folder" onClick={onCreateFolder} />
          {canPasteFolder && onPasteFolder ? (
            <>
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
              <MenuItem icon={ClipboardPaste} label="Paste Folder Here" onClick={onPasteFolder} />
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}
