"""Headline relevance ranking via Hugging Face Inference API embeddings.

Uses the sentence-similarity pipeline of sentence-transformers/all-MiniLM-L6-v2
to order news headlines by relevance to the company before they go into the
outlook prompt. Ranking is best-effort: any failure falls back to feed order.
"""

import logging

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

HF_SIMILARITY_URL = (
    "https://router.huggingface.co/hf-inference/models/"
    "sentence-transformers/all-MiniLM-L6-v2/pipeline/sentence-similarity"
)


async def rank_headlines(query: str, headlines: list[dict], top_k: int = 5) -> list[dict]:
    if len(headlines) <= top_k:
        return headlines
    api_key = get_settings().hf_api_key
    if not api_key:
        return headlines[:top_k]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                HF_SIMILARITY_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "inputs": {
                        "source_sentence": query,
                        "sentences": [h["title"] for h in headlines],
                    }
                },
            )
            res.raise_for_status()
            scores = res.json()
        if not isinstance(scores, list) or len(scores) != len(headlines):
            return headlines[:top_k]
        ranked = sorted(zip(scores, headlines), key=lambda pair: pair[0], reverse=True)
        return [headline for _, headline in ranked[:top_k]]
    except Exception:
        logger.warning("Embedding ranking failed; keeping feed order", exc_info=True)
        return headlines[:top_k]
