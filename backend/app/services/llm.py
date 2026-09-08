"""Optional OpenAI enrichment for agent outputs. Falls back silently to mock."""
from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from app.config import get_settings


def enrich_with_llm(task: str, mock_result: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """
    When llm_mode=openai and openai_api_key is set, ask the model for a short
    narrative + extra citations. On any failure, return mock_result unchanged.
    """
    settings = get_settings()
    if settings.llm_mode != "openai" or not settings.openai_api_key:
        mock_result = dict(mock_result)
        mock_result["llm_mode"] = settings.llm_mode or "mock"
        mock_result.setdefault("llm_enrichment", {"status": "skipped", "reason": "mock mode"})
        return mock_result

    try:
        narrative = _call_openai(task, mock_result, payload)
        out = dict(mock_result)
        out["llm_mode"] = "openai"
        out["llm_enrichment"] = {
            "status": "ok",
            "model": settings.openai_model,
            "narrative": narrative.get("narrative", ""),
        }
        cites = list(out.get("citations") or [])
        for c in narrative.get("citations") or []:
            if c not in cites:
                cites.append(c)
        cites.append(
            {
                "type": "llm",
                "id": f"{settings.openai_model}:{task}",
                "ref": "openai enrichment",
            }
        )
        out["citations"] = cites
        if narrative.get("rationale"):
            out["rationale"] = narrative["rationale"]
        steps = list(out.get("steps") or [])
        steps.append(
            {
                "name": "llm_enrich",
                "status": "success",
                "message": f"OpenAI enrichment via {settings.openai_model}",
            }
        )
        out["steps"] = steps
        return out
    except Exception as exc:  # noqa: BLE001
        out = dict(mock_result)
        out["llm_mode"] = "openai_fallback_mock"
        out["llm_enrichment"] = {"status": "error", "reason": str(exc)[:300]}
        steps = list(out.get("steps") or [])
        steps.append(
            {
                "name": "llm_enrich",
                "status": "warning",
                "message": f"LLM unavailable — using mock ({str(exc)[:120]})",
            }
        )
        out["steps"] = steps
        return out


def _call_openai(task: str, mock_result: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    system = (
        "You are a migration control-plane assistant. Respond with JSON only: "
        '{"narrative": "...", "rationale": "...", "citations": [{"type":"...", "id":"..."}]} . '
        "Do not invent SID attributes. Cite inventory and standards only."
    )
    user = json.dumps(
        {
            "task": task,
            "mock_summary": {
                k: mock_result.get(k)
                for k in (
                    "task",
                    "product_boundary",
                    "confidence",
                    "gaps",
                    "sid_entities",
                    "rationale",
                )
                if k in mock_result
            },
            "payload_keys": list(payload.keys()),
        }
    )
    body = {
        "model": settings.openai_model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    req = request.Request(
        f"{settings.openai_base_url.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=25) as resp:
        raw = json.loads(resp.read().decode("utf-8"))
    content = raw["choices"][0]["message"]["content"]
    return json.loads(content)
