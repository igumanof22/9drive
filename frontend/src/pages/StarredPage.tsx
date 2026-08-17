import { useEffect, useState } from 'react'
import { HardDrive, Star } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { FileTable } from '@/components/drive/FileTable'
import { MetricCard } from '@/components/drive/MetricCard'
import { PageHeader } from '@/components/drive/PageHeader'
import { apiFetch, formatBytes, formatDate } from '@/lib/api'
import type { FileItem } from '@/data/drive-data'

type BackendFile = {
  id: string
  name: string
  mimeType: string
  sizeBytes: string
  createdAt: string
  starredAt?: string | null
  publicRole?: 'reader' | 'commenter' | 'writer' | null
  sharedPeopleCount?: number
  connectedAccount?: { email: string; provider: string; avatarUrl?: string | null }
  folder?: { id: string; name: string } | null
}

function mimeToKind(mimeType: string): FileItem['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('pdf')) return 'pdf'
  return 'doc'
}

function mapFile(file: BackendFile): FileItem {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
    starred: true,
    starredDate: file.starredAt ? formatDate(file.starredAt) : undefined,
    publicRole: file.publicRole ?? null,
    sharedPeopleCount: file.sharedPeopleCount ?? 0,
    accountEmail: file.connectedAccount?.email,
    accountAvatarUrl: file.connectedAccount?.avatarUrl ?? undefined,
    date: formatDate(file.createdAt),
    size: formatBytes(file.sizeBytes),
    access: file.connectedAccount?.email ?? 'Only You',
    kind: mimeToKind(file.mimeType),
    shared: 1,
    folderName: file.folder?.name,
  }
}

export function StarredPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [message, setMessage] = useState('')

  async function load() {
    const data = await apiFetch<{ files: BackendFile[] }>('/files?starred=1')
    setFiles(data.files.map(mapFile))
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : 'Failed to load starred files'))
  }, [])

  async function unstar(file: FileItem) {
    if (!file.id) return
    try {
      await apiFetch(`/files/${file.id}`, { method: 'PATCH', body: JSON.stringify({ starred: false }) })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to remove the star')
    }
  }

  const totalBytes = files.reduce((total, file) => total + Number(file.sizeBytes ?? 0), 0)
  const accounts = new Set(files.map((file) => file.accountEmail).filter(Boolean))

  return (
    <>
      <PageHeader title="Starred" description="Pinned files for quick access." />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <MetricCard label="Starred Files" value={String(files.length)} icon={Star} />
        <MetricCard label="Total Size" value={formatBytes(totalBytes)} icon={HardDrive} />
        <MetricCard label="Drive Accounts" value={String(accounts.size)} icon={HardDrive} />
      </div>
      {message ? <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</p> : null}
      {files.length === 0 ? (
        <Card className="mt-6 p-5">
          <p className="text-sm text-slate-500">Nothing starred yet. Right-click a file in All Files and choose Add to Starred.</p>
        </Card>
      ) : (
        <Card className="mt-6 p-4 sm:p-5">
          <FileTable files={files} mode="starred" onToggleStar={(file) => { unstar(file).catch(() => undefined) }} />
        </Card>
      )}
    </>
  )
}
