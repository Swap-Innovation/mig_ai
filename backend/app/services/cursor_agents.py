"""Live Cursor SDK agents for discovery (requires CURSOR_API_KEY)."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from app.config import get_settings

LogFn = Callable[[str], None]


def cursor_configured() -> bool:
    settings = get_settings()
    return bool((settings.cursor_api_key or "").strip())


def cursor_status() -> dict[str, Any]:
    settings = get_settings()
    key = (settings.cursor_api_key or "").strip()
    return {
        "cursor_configured": bool(key),
        "cursor_model": settings.cursor_model,
        "discovery_mode": "cursor_live" if key else "blocked",
    }


def _extract_text(message: Any) -> str:
    """Best-effort text from an SDK stream message."""
    chunks: list[str] = []
    mtype = getattr(message, "type", None) or getattr(message, "kind", None)
    # Assistant / thinking text
    msg = getattr(message, "message", None)
    content = getattr(msg, "content", None) if msg is not None else None
    if content is None:
        content = getattr(message, "content", None)
    if isinstance(content, list):
        for block in content:
            btype = getattr(block, "type", None)
            text = getattr(block, "text", None)
            if text:
                chunks.append(str(text))
            elif btype == "text" and hasattr(block, "text"):
                chunks.append(str(block.text))
    elif isinstance(content, str):
        chunks.append(content)
    # Tool / shell hints
    if mtype in {"tool_use", "tool", "shell", "system", "status"}:
        name = getattr(message, "name", None) or getattr(message, "tool_name", None)
        status = getattr(message, "status", None)
        if name:
            chunks.append(f"[{mtype}] {name}" + (f" · {status}" if status else ""))
    text_attr = getattr(message, "text", None)
    if text_attr and not chunks:
        chunks.append(str(text_attr))
    return "".join(chunks)


def run_cursor_agent(
    *,
    agent_name: str,
    prompt: str,
    cwd: Path,
    on_log: LogFn | None = None,
) -> dict[str, Any]:
    """
    Run one Cursor local agent against ``cwd``.
    Streams assistant/tool text via ``on_log``. Raises on missing key or run failure.
    """
    settings = get_settings()
    api_key = (settings.cursor_api_key or "").strip()
    if not api_key:
        raise RuntimeError(
            "CURSOR_API_KEY is not set. Discovery requires live Cursor agents — "
            "add the key to backend/.env (Cursor Dashboard → Integrations)."
        )

    try:
        from cursor_sdk import Agent, CursorAgentError, LocalAgentOptions
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "cursor-sdk is not installed. Run: pip install cursor-sdk"
        ) from exc

    log = on_log or (lambda _line: None)
    model = settings.cursor_model or "composer-2.5"
    cwd_s = str(cwd.resolve())

    log(f"$ cursor agent create · {agent_name} · model={model}")
    log(f"$ cwd {cwd_s}")

    try:
        with Agent.create(
            api_key=api_key,
            model=model,
            name=f"mirage-discovery-{agent_name}",
            local=LocalAgentOptions(cwd=cwd_s),
        ) as agent:
            agent_id = getattr(agent, "agent_id", None) or getattr(agent, "agentId", None)
            log(f"$ agent_id {agent_id or '—'}")
            run = agent.send(prompt)
            run_id = getattr(run, "id", None)
            log(f"$ run {run_id or '—'} · streaming…")

            buf = ""
            for message in run.messages():
                piece = _extract_text(message)
                if not piece:
                    continue
                buf += piece
                # Emit complete lines; keep remainder
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    line = line.rstrip()
                    if line.strip():
                        log(line)
            if buf.strip():
                log(buf.strip())

            result = run.wait()
            status = getattr(result, "status", None)
            final_text = getattr(result, "result", None) or ""
            if isinstance(final_text, str) and final_text.strip():
                for line in final_text.strip().splitlines()[-40:]:
                    if line.strip():
                        log(line.rstrip())

            if status == "error":
                raise RuntimeError(
                    f"Cursor agent {agent_name} run failed (run_id={run_id})"
                )

            log(f"$ agent {agent_name} finished · status={status}")
            return {
                "agent": agent_name,
                "agent_id": agent_id,
                "run_id": run_id,
                "status": status,
                "result": final_text if isinstance(final_text, str) else str(final_text),
            }
    except CursorAgentError as err:
        retryable = getattr(err, "is_retryable", False)
        msg = getattr(err, "message", None) or str(err)
        log(f"! cursor startup error · retryable={retryable} · {msg}")
        raise RuntimeError(f"Cursor agent failed to start ({agent_name}): {msg}") from err


# Role prompts — agents inspect estate; parsers still materialize inventory after each phase.
AGENT_PROMPTS: list[tuple[str, str, str]] = [
    (
        "DiscoveryCoordinator",
        "plan",
        "You are DiscoveryCoordinator for a legacy→cloud migration.\n"
        "Inspect this estate root (cwd). In under 20 lines, outline a leaf→root plan: "
        "SQL → scripts → DAGs/orchestration → catalog → lineage → inventory.\n"
        "List top-level folders and which agents should run. Do not modify files.",
    ),
    (
        "StructureAnalyst",
        "structure",
        "You are StructureAnalyst. Map the repository layout under cwd.\n"
        "Report: top folders, presence of dags/, sql/, scripts/, catalog/, git remote if any, "
        "and likely technologies (SQL, Airflow/DAG json, shell, dbt, Spark).\n"
        "Be concise (≤25 lines). Do not modify files.",
    ),
    (
        "SqlLeafScanner",
        "sql",
        "You are SqlLeafScanner. Find SQL files under cwd.\n"
        "List notable .sql paths and inferred input/output table names if obvious from CREATE/INSERT/FROM.\n"
        "≤30 lines. Do not modify files.",
    ),
    (
        "ScriptScanner",
        "scripts",
        "You are ScriptScanner. Find shell/Python ETL scripts under cwd.\n"
        "List script paths and any SQL they invoke or tables they mention.\n"
        "≤25 lines. Do not modify files.",
    ),
    (
        "OrchestrationScanner",
        "orchestration",
        "You are OrchestrationScanner. Find DAG/scheduler definitions under cwd (dags/, scheduler files).\n"
        "List DAG ids, schedules, and task→script links.\n"
        "≤30 lines. Do not modify files.",
    ),
    (
        "CatalogUsageHarvester",
        "catalog",
        "You are CatalogUsageHarvester. Look for catalog/BI metadata or usage hints under cwd.\n"
        "Summarize what you find (or say none). ≤20 lines. Do not modify files.",
    ),
    (
        "LineageStitcher",
        "lineage",
        "You are LineageStitcher. From what you can see in cwd, describe expected lineage: "
        "repo → DAG → task → script → tables (inputs vs outputs).\n"
        "≤25 lines. Do not modify files.",
    ),
    (
        "InventoryProfiler",
        "inventory",
        "You are InventoryProfiler. Summarize objects that should appear in a technical inventory "
        "(tables, scripts, DAGs, repo) and any PII/profile hints from names.\n"
        "≤25 lines. Do not modify files.",
    ),
]


def run_discovery_agent_phase(
    *,
    agent_name: str,
    phase: str,
    cwd: Path,
    on_log: LogFn,
    extra_context: str = "",
) -> dict[str, Any]:
    """Run the matching live Cursor agent for a discovery phase."""
    prompt = next((p for n, ph, p in AGENT_PROMPTS if n == agent_name), None)
    if not prompt:
        prompt = (
            f"You are {agent_name} ({phase}). Inspect cwd and summarize findings for "
            "legacy estate discovery. Do not modify files. Keep under 20 lines."
        )
    if extra_context:
        prompt = prompt + "\n\nContext:\n" + extra_context[:4000]
    on_log(f"── {agent_name} · {phase} ──")
    return run_cursor_agent(
        agent_name=agent_name,
        prompt=prompt,
        cwd=cwd,
        on_log=on_log,
    )
