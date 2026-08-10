import { useEffect, useRef, useState, type DragEvent } from "react";
import { Upload, X } from "lucide-react";

import { cn } from "@/lib/cn";

const MAX_IMAGES_PER_LISTING = 6;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface ImageUploadFieldProps {
  existingCount: number;
  files: File[];
  onFilesChange: (files: File[]) => void;
  error?: string;
}

/**
 * FR-030/API-031: client-side mirror of the server's own image constraints
 * (JPEG/PNG/WebP, 5 MB each, 6 images total per listing) — purely a UX
 * nicety (FE-020) so a seller finds out before waiting on an upload; the
 * server re-validates all of this regardless (SEC-060).
 *
 * The dropzone is a `<label>` wrapping the (visually hidden but focusable)
 * native file input — clicking/tapping anywhere in it opens the file picker
 * via native label semantics, so there's no need for a second, redundant
 * `role="button"` tab stop layered on top of the real input.
 */
export function ImageUploadField({
  existingCount,
  files,
  onFilesChange,
  error,
}: ImageUploadFieldProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<Map<File, string>>(new Map());
  const [isDragActive, setIsDragActive] = useState(false);
  const remaining = MAX_IMAGES_PER_LISTING - existingCount - files.length;

  // Keep one object URL per `File` alive only as long as that file is still
  // selected, so removing a file (or unmounting the form) doesn't leak them.
  useEffect(() => {
    const cache = previewUrls.current;
    const current = new Set(files);
    for (const [file, url] of cache) {
      if (!current.has(file)) {
        URL.revokeObjectURL(url);
        cache.delete(file);
      }
    }
    for (const file of files) {
      if (!cache.has(file)) {
        cache.set(file, URL.createObjectURL(file));
      }
    }
  }, [files]);

  useEffect(() => {
    const cache = previewUrls.current;
    return () => {
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  function addFiles(selected: File[]): void {
    if (selected.length === 0) return;
    onFilesChange([...files, ...selected]);
  }

  function handleSelect(event: React.ChangeEvent<HTMLInputElement>): void {
    addFiles(Array.from(event.target.files ?? []));
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragActive(false);
    if (remaining <= 0) return;
    addFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function removeFile(index: number): void {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">Photos</span>
      <label
        htmlFor="listing-images"
        onDragOver={(event) => {
          event.preventDefault();
          if (remaining > 0) setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          remaining <= 0
            ? "cursor-not-allowed border-border bg-paper-muted text-ink-soft"
            : isDragActive
              ? "border-moss-500 bg-moss-50"
              : "border-border-strong bg-paper-muted/60 hover:border-moss-500/60 hover:bg-moss-50/60",
        )}
      >
        <Upload aria-hidden="true" className="size-6 text-ink-muted" />
        <span className="text-sm font-medium text-ink">
          {remaining > 0 ? "Drag & drop photos, or click to browse" : "Photo limit reached"}
        </span>
        <input
          ref={inputRef}
          id="listing-images"
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          disabled={remaining <= 0}
          onChange={handleSelect}
          aria-describedby="listing-images-hint"
          className="sr-only"
        />
      </label>
      <p id="listing-images-hint" className="text-xs text-ink-muted">
        JPEG, PNG, or WebP, up to 5 MB each. {Math.max(remaining, 0)} more can be added (
        {MAX_IMAGES_PER_LISTING} total per listing).
      </p>
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {files.map((file, index) => {
            const tooLarge = file.size > MAX_IMAGE_SIZE_BYTES;
            return (
              <li key={`${file.name}-${index}`} className="relative">
                <div
                  className={cn(
                    "aspect-square overflow-hidden rounded-lg border bg-paper-muted",
                    tooLarge ? "border-clay-500" : "border-border",
                  )}
                >
                  <img
                    src={previewUrls.current.get(file)}
                    alt={file.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-white shadow-card hover:bg-clay-600"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
                {tooLarge && (
                  <p className="mt-1 truncate text-[11px] font-medium text-clay-600">Too large</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-clay-600">
          {error}
        </p>
      )}
    </div>
  );
}
