import { FileArchive, FileAudio, FileCode, FileImage, FilePlay, FileSpreadsheet, FileText, Presentation, type LucideIcon } from 'lucide-react'
import type { FileItem } from '@/data/drive-data'

// googleEditor names the Google editor that owns this format. Files that have one are opened
// in Drive instead of the built-in preview, which cannot render an editable document.
export type FileType = { label: string; Icon: LucideIcon; tone: string; googleEditor?: 'document' | 'spreadsheets' | 'presentation' | 'forms' | 'drawings' }

const word: FileType = { label: 'Word', Icon: FileText, tone: 'bg-blue-600', googleEditor: 'document' }
const excel: FileType = { label: 'Excel', Icon: FileSpreadsheet, tone: 'bg-emerald-600', googleEditor: 'spreadsheets' }
const powerpoint: FileType = { label: 'PowerPoint', Icon: Presentation, tone: 'bg-orange-600', googleEditor: 'presentation' }
// Plain tabular text has no Google format of its own, so it keeps the normal preview.
const csv: FileType = { label: 'CSV', Icon: FileSpreadsheet, tone: 'bg-emerald-600' }
const pdf: FileType = { label: 'PDF', Icon: FileText, tone: 'bg-red-500' }
const image: FileType = { label: 'Image', Icon: FileImage, tone: 'bg-yellow-400' }
const video: FileType = { label: 'Video', Icon: FilePlay, tone: 'bg-orange-500' }
const audio: FileType = { label: 'Audio', Icon: FileAudio, tone: 'bg-purple-500' }
const archive: FileType = { label: 'Archive', Icon: FileArchive, tone: 'bg-slate-500' }
const code: FileType = { label: 'Code', Icon: FileCode, tone: 'bg-slate-700' }
const document: FileType = { label: 'Document', Icon: FileText, tone: 'bg-blue-500' }

// Google's own formats carry no extension at all, so only the mime type can name them.
const byMimeType: Record<string, FileType> = {
  'application/vnd.google-apps.document': { ...word, label: 'Google Docs' },
  'application/vnd.google-apps.spreadsheet': { ...excel, label: 'Google Sheets' },
  'application/vnd.google-apps.presentation': { ...powerpoint, label: 'Google Slides' },
  'application/vnd.google-apps.form': { ...document, label: 'Google Form', googleEditor: 'forms' },
  'application/vnd.google-apps.drawing': { ...image, label: 'Google Drawing', googleEditor: 'drawings' },
  'application/pdf': pdf,
  'application/msword': word,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': word,
  'application/vnd.oasis.opendocument.text': word,
  'application/vnd.ms-excel': excel,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': excel,
  'application/vnd.oasis.opendocument.spreadsheet': excel,
  'application/vnd.ms-powerpoint': powerpoint,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': powerpoint,
  'application/vnd.oasis.opendocument.presentation': powerpoint,
  'application/zip': archive,
  'application/x-rar-compressed': archive,
  'application/x-7z-compressed': archive,
  'application/gzip': archive,
  'text/csv': csv,
  'text/plain': { ...document, label: 'Text' },
  'text/markdown': { ...document, label: 'Markdown' },
}

// A file uploaded with a generic mime type (octet-stream is common) still tells the truth
// through its extension.
const byExtension: Record<string, FileType> = {
  doc: word, docx: word, rtf: word, odt: word,
  xls: excel, xlsx: excel, xlsm: excel, ods: excel, csv,
  ppt: powerpoint, pptx: powerpoint, odp: powerpoint,
  pdf,
  zip: archive, rar: archive, '7z': archive, tar: archive, gz: archive,
  mp3: audio, wav: audio, m4a: audio, flac: audio, ogg: audio,
  json: code, js: code, ts: code, tsx: code, html: code, css: code, xml: code, sql: code, sh: code, py: code, java: code,
  txt: { ...document, label: 'Text' }, md: { ...document, label: 'Markdown' },
}

const googleAppsPrefix = 'application/vnd.google-apps.'

/** Turns "application/vnd.google-apps.script" into "Google Script". */
function googleAppsLabel(mimeType: string) {
  const suffix = mimeType.slice(googleAppsPrefix.length)
  return `Google ${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`
}

export function getFileType(file: { name: string; mimeType?: string; kind?: FileItem['kind'] }): FileType {
  const mimeType = file.mimeType ?? ''
  const exact = byMimeType[mimeType]
  if (exact) return exact
  // Google keeps adding formats (Sites, Vids, Apps Script). Naming them from the mime type
  // beats calling every one of them "Document".
  if (mimeType.startsWith(googleAppsPrefix)) return { ...document, label: googleAppsLabel(mimeType) }
  if (mimeType.startsWith('image/')) return image
  if (mimeType.startsWith('video/')) return video
  if (mimeType.startsWith('audio/')) return audio

  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : ''
  const guessed = byExtension[extension]
  if (guessed) return guessed

  // Dummy data across the app carries only the coarse kind, never a mime type.
  if (file.kind === 'image') return image
  if (file.kind === 'video') return video
  if (file.kind === 'pdf') return pdf
  return document
}

/**
 * Where a file should open when it is not previewable in 9Drive.
 *
 * The three big editors get their direct URL so the editor opens straight away. Every other
 * Google format — Sites, Apps Script, My Maps, whatever Google ships next — goes through
 * Drive's own opener, which routes to the right product without this app having to keep a
 * list of per-product URLs that would fall behind.
 */
export function googleOpenUrl(file: { name: string; mimeType?: string; kind?: FileItem['kind'] }, providerFileId: string) {
  const { googleEditor } = getFileType(file)
  if (googleEditor) return `https://docs.google.com/${googleEditor}/d/${providerFileId}/edit`
  if ((file.mimeType ?? '').startsWith(googleAppsPrefix)) return `https://drive.google.com/open?id=${providerFileId}`
  return null
}
