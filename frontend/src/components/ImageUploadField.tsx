import { useRef } from "react";

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
 */
export function ImageUploadField({
  existingCount,
  files,
  onFilesChange,
  error,
}: ImageUploadFieldProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = MAX_IMAGES_PER_LISTING - existingCount - files.length;

  function handleSelect(event: React.ChangeEvent<HTMLInputElement>): void {
    const selected = Array.from(event.target.files ?? []);
    onFilesChange([...files, ...selected]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function removeFile(index: number): void {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="listing-images" className="text-sm font-medium text-slate-800">
        Images
      </label>
      <input
        ref={inputRef}
        id="listing-images"
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        disabled={remaining <= 0}
        onChange={handleSelect}
        aria-describedby="listing-images-hint"
        className="text-sm text-slate-700"
      />
      <p id="listing-images-hint" className="text-xs text-slate-500">
        JPEG, PNG, or WebP, up to 5 MB each. {Math.max(remaining, 0)} more can be added (
        {MAX_IMAGES_PER_LISTING} total per listing).
      </p>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
            >
              <span className="max-w-[10rem] truncate">{file.name}</span>
              {file.size > MAX_IMAGE_SIZE_BYTES && (
                <span className="font-medium text-red-700">Too large</span>
              )}
              <button
                type="button"
                onClick={() => removeFile(index)}
                aria-label={`Remove ${file.name}`}
                className="font-medium text-slate-500 hover:text-slate-800"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
