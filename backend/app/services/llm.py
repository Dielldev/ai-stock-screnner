"""Groq LLM calls: natural-language portfolio parsing and the AI Outlook."""

import json

from groq import AsyncGroq

from ..config import get_settings

_groq: AsyncGroq | None = None

PARSE_SYSTEM_PROMPT = """\
You are a precise financial data extraction engine.
Extract stock/ETF holdings from the user's plain-English portfolio description.

Respond with ONLY a JSON object in this exact shape:
{"holdings": [{"ticker": "NVDA", "shares": 10, "avg_price": 180.0}], "ignored": []}

Rules:
- ticker: the uppercase US exchange symbol. Map company names to their primary ticker \
("Apple" -> "AAPL", "Vanguard S&P 500 ETF" -> "VOO").
- shares: number of shares/units held (fractional allowed).
- avg_price: average cost per share in USD as a plain number, no currency symbols. \
If the user states a total cost, divide it by the share count.
- If shares or average price is missing, or the security cannot be confidently identified, \
do not guess: leave it out of "holdings" and add a short reason string to "ignored".
- Never invent or estimate values that are not stated or directly computable.
"""

OUTLOOK_SYSTEM_PROMPT = """\
You are an equity research assistant producing a short-term "AI Outlook" — a sentiment \
analysis, NOT a price prediction and NOT financial advice.
You will receive technical indicators, recent news headlines, and an excerpt from the \
company's latest SEC filing.

Respond with ONLY a JSON object in this exact shape:
{"sentiment": "bullish", "summary": "...", "risks": ["...", "...", "..."]}

Rules:
- sentiment: one of "bullish", "neutral", "bearish" — the overall tone of the next 3-5 \
trading days that the data supports.
- summary: 2-4 plain-English sentences describing the 3-5 day outlook. Cite the strongest \
specific evidence (e.g. RSI level, price vs the 50-day average, a headline, a filing detail).
- risks: 3 to 5 short, concrete risk factors for this stock right now.
- Ground every claim in the provided data only; do not rely on outside knowledge of recent events.
- If the data is mixed, weak, or missing, choose "neutral" and say why.
- Never give price targets, buy/sell recommendations, or financial advice.
"""


def _client() -> AsyncGroq:
    global _groq
    if _groq is None:
        _groq = AsyncGroq(api_key=get_settings().groq_api_key)
    return _groq


async def _json_completion(system_prompt: str, user_content: str, temperature: float) -> dict:
    completion = await _client().chat.completions.create(
        model=get_settings().groq_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=temperature,
        max_tokens=1024,
        response_format={"type": "json_object"},
    )
    return json.loads(completion.choices[0].message.content)


async def parse_holdings_text(text: str) -> dict:
    return await _json_completion(PARSE_SYSTEM_PROMPT, text, temperature=0.0)


async def generate_outlook(context: str) -> dict:
    return await _json_completion(OUTLOOK_SYSTEM_PROMPT, context, temperature=0.3)
