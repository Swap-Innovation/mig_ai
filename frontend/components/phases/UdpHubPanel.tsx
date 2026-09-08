"use client";

type Props = {
  hub: any | null;
  busy?: boolean;
  canEdit?: boolean;
  onRefresh?: () => void;
  onBindSpoke?: (spokeId: string) => void;
  onProbe?: () => void;
};

export function UdpHubPanel({
  hub,
  busy,
  canEdit = false,
  onRefresh,
  onBindSpoke,
  onProbe,
}: Props) {
  if (!hub) {
    return (
      <div className="card p-5 text-sm text-tm-gray-600">
        UDP Hub status not loaded.
        {onRefresh && (
          <button className="btn mt-3" disabled={busy} onClick={onRefresh}>
            Load hub status
          </button>
        )}
      </div>
    );
  }

  const probe = hub.last_probe;
  const adapters = probe?.adapters || {};

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{hub.hub?.name}</h3>
            <p className="mt-1 text-sm text-tm-gray-600">
              Hub–spoke landing zone · {hub.hub?.region} ·{" "}
              <span className="badge-success">{hub.hub?.state}</span>
              {hub.require_hub_probe ? (
                <span className="ml-2 text-[10px] font-semibold uppercase text-tm-magenta">
                  Probe required for Ready
                </span>
              ) : (
                <span className="ml-2 text-[10px] uppercase text-tm-gray-400">
                  Probe optional
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onRefresh && (
              <button className="btn-ghost text-xs" disabled={busy} onClick={onRefresh}>
                Refresh
              </button>
            )}
            {canEdit && onProbe && (
              <button className="btn text-xs" disabled={busy} onClick={onProbe}>
                Run probe
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(hub.hub?.services || []).map((s: any) => (
            <span key={s.id} className="badge-neutral">
              {s.label} · {s.status}
            </span>
          ))}
        </div>
        {probe ? (
          <div className="rounded-lg bg-tm-gray-50 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={hub.probe_ok ? "badge-success" : "badge bg-amber-50 text-warn"}>
                {hub.probe_ok ? "Probe OK" : "Probe failed"}
              </span>
              <span className="text-tm-gray-500">
                {probe.probed_at || ""}
                {probe.probed_by ? ` · ${probe.probed_by}` : ""}
                {probe.total_latency_ms != null ? ` · ${probe.total_latency_ms} ms` : ""}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(adapters).map(([id, a]: [string, any]) => (
                <span key={id} className="badge-neutral font-mono">
                  {id} {a?.reachable ? "✓" : "✗"} {a?.latency_ms != null ? `${a.latency_ms}ms` : ""}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-tm-gray-500">
            No probe yet — bind a spoke and run probe to verify stub adapters (GCS / BQ / Composer).
          </p>
        )}
        <ul className="space-y-1 text-xs text-tm-gray-600">
          {(hub.notes || []).map((n: string) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {(hub.spokes || []).map((sp: any) => {
          const bound = !!sp.bound || sp.id === hub.hub_spoke_id;
          return (
            <div
              key={sp.id}
              className={`card space-y-2 ${bound ? "border-tm-magenta/40" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-tm-ink">{sp.label}</div>
                {bound && <span className="badge-success text-[10px]">Bound</span>}
              </div>
              <div className="font-mono text-xs text-tm-gray-500">{sp.project}</div>
              <p className="text-xs text-tm-gray-600">{sp.purpose}</p>
              {canEdit && onBindSpoke && !bound && (
                <button
                  className="btn-secondary w-full text-xs"
                  disabled={busy}
                  onClick={() => onBindSpoke(sp.alias || sp.id)}
                >
                  Bind project to this spoke
                </button>
              )}
              <div className="border-t border-tm-gray-100 pt-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  IAM (stub)
                </div>
                <ul className="mt-1 space-y-1 text-[11px] text-tm-gray-600">
                  {(sp.iam || []).map((b: any, i: number) => (
                    <li key={i} className="rounded bg-tm-gray-50 px-2 py-1 font-mono">
                      {b.principal} → {b.role}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {hub.perimeter && (
        <div className="card text-sm">
          <h4 className="text-sm font-semibold">Security perimeter</h4>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-tm-gray-500">VPC-SC</dt>
              <dd className="font-mono">{hub.perimeter.vpc_sc}</dd>
            </div>
            <div>
              <dt className="text-tm-gray-500">CMEK</dt>
              <dd className="truncate font-mono">{hub.perimeter.cmek}</dd>
            </div>
            <div>
              <dt className="text-tm-gray-500">No standing human prod access</dt>
              <dd>{hub.perimeter.no_standing_human_prod_access ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-tm-gray-500">Secrets in managed store</dt>
              <dd>{hub.perimeter.secrets_in_store_only ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
