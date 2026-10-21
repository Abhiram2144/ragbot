import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { api, type Doc } from '../api/client'

const ACCEPTED = '.pdf,.txt,.md,.docx'

interface Props {
  kbId: string
  onUploaded: (doc: Doc) => void
}

export default function UploadDropzone({ kbId, onUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [metadata, setMetadata] = useState({ department: 'HR', owner: '', effective_date: '', review_date: '', publication_status: 'published' as const })

  async function handleFile(file: File) {
    setUploading(true)
    setError('')
    try {
      const doc = await api.documents.upload(kbId, file, {
        ...metadata,
        owner: metadata.owner || undefined,
        effective_date: metadata.effective_date || undefined,
        review_date: metadata.review_date || undefined,
      })
      onUploaded(doc)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault()
    dragCounter.current++
    setIsDragging(true)
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const active = isDragging && !uploading

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setMetadataOpen(open => !open)} className="self-end text-xs font-medium text-primary cursor-pointer">
        {metadataOpen ? 'Hide document details' : 'Add document details'}
      </button>
      {metadataOpen && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-stroke bg-surface p-3">
          <label className="text-xs text-ink/55">Department<input value={metadata.department} onChange={e => setMetadata({ ...metadata, department: e.target.value })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none" /></label>
          <label className="text-xs text-ink/55">Owner<input value={metadata.owner} onChange={e => setMetadata({ ...metadata, owner: e.target.value })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none" placeholder="name or email" /></label>
          <label className="text-xs text-ink/55">Effective date<input type="date" value={metadata.effective_date} onChange={e => setMetadata({ ...metadata, effective_date: e.target.value })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none" /></label>
          <label className="text-xs text-ink/55">Review date<input type="date" value={metadata.review_date} onChange={e => setMetadata({ ...metadata, review_date: e.target.value })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none" /></label>
          <label className="text-xs text-ink/55">Lifecycle status<select value={metadata.publication_status} onChange={e => setMetadata({ ...metadata, publication_status: e.target.value as typeof metadata.publication_status })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload document"
        className="rounded-xl border-2 border-dashed px-6 py-8 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors duration-150 outline-none"
        style={{
          borderColor: active
            ? 'var(--color-primary)'
            : 'var(--color-stroke)',
          background: active
            ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)'
            : 'transparent',
        }}
        onDragEnter={onDragEnter}
        onDragOver={e => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={onChange}
          aria-hidden
        />

        {uploading ? (
          <>
            <svg className="animate-spin h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-ink/50">Uploading…</p>
          </>
        ) : (
          <>
            <svg
              width="28" height="28" viewBox="0 0 24 24" fill="none"
              style={{ color: active ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-ink) 30%, transparent)' }}
              className="transition-colors duration-150"
              aria-hidden
            >
              <path d="M12 16V8M8 12l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 16.8A4 4 0 0 0 18 9h-1.26A8 8 0 1 0 4 15.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-sm text-ink/70">
                <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>Click to browse</span>
                {' '}or drag a file here
              </p>
              <p className="text-xs text-ink/40 mt-1">PDF, TXT, MD, DOCX · max 20 MB</p>
            </div>
          </>
        )}
      </div>

      {error && (
        <p
          className="text-xs px-3 py-2 rounded-lg text-ink"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
