import { useEffect, useRef, useState, type DragEvent } from "react";
import { Camera, X } from "lucide-react";

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
      <label
        htmlFor="listing-images"
        onDragOver={(event) => {
          event.preventDefault();
          if (remaining > 0) setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer items-center gap-4 rounded-xs border border-dashed px-4 py-5 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ballpoint has-[:focus-visible]:[outline-style:solid]",
          remaining <= 0
            ? "cursor-not-allowed border-rule bg-field text-ink-2"
            : isDragActive
              ? "border-ballpoint bg-field"
              : "border-rule-strong bg-white hover:border-ink",
        )}
      >
        <Camera aria-hidden="true" className="size-6 shrink-0 text-ink-2" />
        <span className="flex flex-col">
          <span className="text-15 font-medium text-ink">
            {remaining > 0 ? "Add a photo of your copy" : "Photo limit reached"}
          </span>
          {remaining > 0 && (
            <span className="text-15 text-ink-2">
              Choose files or drop them here. The first photo is the one buyers see first.
            </span>
          )}
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
      <p id="listing-images-hint" className="text-13 text-ink-2">
        JPEG, PNG, or WebP, up to 5 MB each. {Math.max(remaining, 0)} more can be added (
        {MAX_IMAGES_PER_LISTING} total per listing).
      </p>
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
          {files.map((file, index) => {
            const tooLarge = file.size > MAX_IMAGE_SIZE_BYTES;
            return (
              <li key={`${file.name}-${index}`} className="flex flex-col">
                {/* Previewed the way buyers will see it: uncropped, at its
                    true proportions, on the square evidence field. */}
                <div
                  className={cn(
                    "relative aspect-square rounded-xs bg-field",
                    tooLarge && "outline outline-2 outline-danger",
                  )}
                >
                  <img
                    src={previewUrls.current.get(file)}
                    alt={file.name}
                    className="absolute inset-[6%] h-[88%] w-[88%] object-contain"
                  />
                </div>
                {tooLarge && <p className="mt-1 text-13 font-medium text-danger">Too large</p>}
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                  className="inline-flex min-h-11 items-center gap-1 self-start text-15 text-ink-2 underline-offset-4 hover:text-danger hover:underline"
                >
                  <X aria-hidden="true" className="size-3.5" />
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-13 font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
