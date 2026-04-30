"""
extract.py - Extract text from uploaded files.

Supports .txt, .md, .html, and .pdf. Returns plain text
suitable for feeding into a review prompt.
"""

import re
from io import BytesIO
from pathlib import Path


# File types we accept and their extraction method
SUPPORTED_EXTENSIONS = {
    # Documents
    ".txt", ".md", ".html", ".htm", ".pdf",
    # Code
    ".py", ".js", ".ts", ".jsx", ".tsx", ".css",
    ".json", ".yaml", ".yml", ".toml",
    ".sh", ".bash", ".sql",
    ".java", ".go", ".rs", ".rb", ".c", ".h", ".cpp",
}


def extract_text(filename: str, content: bytes) -> str:
    """Extract text from file content based on extension.

    Args:
        filename: Original filename (used for extension detection).
        content: Raw file bytes.

    Returns:
        Extracted text as a string.

    Raises:
        ValueError: If file type is unsupported or extraction fails.
    """
    ext = Path(filename).suffix.lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {ext}. "
            f"Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    if ext in (".txt", ".md"):
        return content.decode("utf-8", errors="replace")

    if ext in (".html", ".htm"):
        return _strip_html(content.decode("utf-8", errors="replace"))

    if ext == ".pdf":
        return _extract_pdf(content)

    # Everything else (code, config) is plain text
    return content.decode("utf-8", errors="replace")


def _strip_html(html: str) -> str:
    """Remove HTML tags, collapse whitespace, return text."""
    # Remove script and style blocks entirely
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # Remove remaining tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode common entities
    for entity, char in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                         ("&quot;", '"'), ("&#39;", "'"), ("&nbsp;", " ")]:
        text = text.replace(entity, char)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_pdf(content: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber."""
    try:
        import pdfplumber
    except ImportError:
        raise ValueError(
            "PDF support requires pdfplumber. "
            "Install with: pip install pdfplumber"
        )

    pages = []
    with pdfplumber.open(BytesIO(content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)

    if not pages:
        raise ValueError("No text could be extracted from PDF. It may be image-based.")

    return "\n\n".join(pages)
