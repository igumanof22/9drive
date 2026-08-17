import { cn } from '@/lib/utils'
import type { FileItem } from '@/data/drive-data'
import { getFileType } from '@/lib/file-type'

export function FileIcon({ file, className }: { file: { name: string; mimeType?: string; kind?: FileItem['kind'] }; className?: string }) {
  const { Icon, tone } = getFileType(file)
  return <Icon className={cn('h-4 w-4 rounded-sm p-0.5 text-white', tone, className)} />
}
