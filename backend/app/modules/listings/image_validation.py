"""Image upload validation (API-031, SEC-060).

Content type is determined by sniffing the file's actual bytes (magic
numbers), never trusted from the client's declared `Content-Type` header or
filename — either can claim anything. No third-party library (e.g.
`python-magic`, which needs the system `libmagic` — extra Docker image
surface) is used for this: JPEG/PNG/WebP are exactly three well-known,
trivially-recognized byte signatures, so hand-rolling this check keeps the
dependency list minimal, consistent with this codebase's general posture
throughout (see e.g. `app.core.rate_limit`'s hand-rolled limiter for the
same reasoning).
"""

_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_RIFF_MAGIC = b"RIFF"
_WEBP_MAGIC = b"WEBP"

# API-031: JPEG/PNG/WebP only.
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def sniff_image_content_type(data: bytes) -> str | None:
    """Returns the actual image content type per its magic bytes, or
    `None` if `data` doesn't match any of the three formats API-031 allows.
    """
    if data.startswith(_JPEG_MAGIC):
        return "image/jpeg"
    if data.startswith(_PNG_MAGIC):
        return "image/png"
    if data[:4] == _RIFF_MAGIC and data[8:12] == _WEBP_MAGIC:
        return "image/webp"
    return None


def extension_for_content_type(content_type: str) -> str:
    """`content_type` MUST be one already returned by
    `sniff_image_content_type` — this is an internal lookup for building a
    storage key (SEC-061), not a second validation pass.
    """
    return _EXTENSION_BY_CONTENT_TYPE[content_type]
