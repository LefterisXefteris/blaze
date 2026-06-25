from app.services.llm.client import get_openai_client, openai_available
from app.types import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL


def embeddings_available() -> bool:
    return openai_available()


async def embed_text(text: str) -> list[float] | None:
    openai = get_openai_client()
    if not openai or not text.strip():
        return None

    try:
        response = await openai.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text[:8000],
            dimensions=EMBEDDING_DIMENSIONS,
        )
        return response.data[0].embedding if response.data else None
    except Exception as error:
        print(f"Embedding failed: {error}")
        return None


async def embed_texts(texts: list[str]) -> list[list[float] | None]:
    openai = get_openai_client()
    if not openai or not texts:
        return [None] * len(texts)

    inputs = [t[:8000] for t in texts if t.strip()]
    if not inputs:
        return [None] * len(texts)

    try:
        response = await openai.embeddings.create(
            model=EMBEDDING_MODEL,
            input=inputs,
            dimensions=EMBEDDING_DIMENSIONS,
        )
        by_index = {d.index: d.embedding for d in response.data}
        input_idx = 0
        result: list[list[float] | None] = []
        for t in texts:
            if not t.strip():
                result.append(None)
            else:
                result.append(by_index.get(input_idx))
                input_idx += 1
        return result
    except Exception as error:
        print(f"Batch embedding failed: {error}")
        return [None] * len(texts)


def vector_to_sql(embedding: list[float]) -> str:
    return f"[{','.join(str(x) for x in embedding)}]"
