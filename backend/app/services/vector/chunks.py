MAX_CHUNK_CHARS = 1800


def split_into_chunks(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    normalized = text.strip()
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]

    paragraphs = normalized.split("\n\n")
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        piece = paragraph.strip()
        if not piece:
            continue

        if len(piece) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            for i in range(0, len(piece), max_chars):
                chunks.append(piece[i : i + max_chars])
            continue

        combined = f"{current}\n\n{piece}" if current else piece
        if len(combined) > max_chars:
            if current:
                chunks.append(current.strip())
            current = piece
        else:
            current = combined

    if current.strip():
        chunks.append(current.strip())
    return chunks


def build_github_index_text(
    repo: str,
    number: int,
    title: str,
    item_type: str,
    ai_summary: str | None = None,
    body: str | None = None,
    comments: list[dict[str, str]] | None = None,
) -> dict[str, object]:
    label = "Pull request" if item_type == "pull_request" else "Issue"
    purpose = (
        ai_summary.strip()
        if ai_summary and ai_summary.strip()
        else f"{label} {repo}#{number}: {title}"
    )

    header_parts = [
        f"Purpose: {purpose}",
        f"{label}: {repo}#{number}",
        f"Title: {title}",
        f"Description:\n{body.strip()}" if body and body.strip() else None,
        f"Summary:\n{ai_summary.strip()}" if ai_summary and ai_summary.strip() else None,
    ]
    header = "\n\n".join(p for p in header_parts if p)

    comment_block = ""
    if comments:
        recent = comments[-12:]
        comment_lines = "\n".join(f"{c['speaker']}: {c['content']}" for c in recent)
        comment_block = f"Comments:\n{comment_lines}"

    full = "\n\n".join(p for p in [header, comment_block] if p)
    return {"purpose": purpose, "chunks": split_into_chunks(full)}


def build_meeting_index_text(
    ai_summary: str,
    title: str | None = None,
    decisions: list[str] | None = None,
    action_items: list[dict[str, str]] | None = None,
) -> dict[str, object]:
    purpose = (
        ai_summary.split("\n")[0][:240]
        if ai_summary
        else (title or "Meeting notes")
    )
    body_parts = [
        f"Meeting: {title}" if title else None,
        f"Summary:\n{ai_summary}",
        f"Decisions:\n" + "\n".join(f"- {d}" for d in decisions) if decisions else None,
        (
            f"Action items:\n" + "\n".join(f"- {a['text']}" for a in action_items)
            if action_items
            else None
        ),
    ]
    body = "\n\n".join(p for p in body_parts if p)
    return {"purpose": purpose, "chunks": split_into_chunks(body)}
