import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lookupIp, placeOf, type IpInfo } from "@/lib/ip";
import { cn } from "@/lib/utils";

/**
 * What the rest of the internet sees when this machine connects.
 *
 * The lookup runs on open rather than behind a button: checking the
 * address is the entire reason the panel was opened, and a tool that
 * makes you press Go to do its one job is a worse trade than a request
 * you were always going to make.
 */
export default function MyIp() {
  const [info, setInfo] = useState<IpInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // Survives a re-render, and lets a refresh cancel a slow first attempt
  // instead of racing it.
  const runRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    runRef.current?.abort();
    const run = new AbortController();
    runRef.current = run;
    // Aborted with a TimeoutError so lib/ip.ts can tell a slow network
    // from a cancelled lookup; a bare abort() reports the wrong message.
    const timeout = setTimeout(
      () => run.abort(new DOMException("The lookup timed out.", "TimeoutError")),
      8000,
    );

    setBusy(true);
    setError(null);
    try {
      setInfo(await lookupIp(run.signal));
    } catch (err) {
      // Any abort means this attempt was replaced or the panel closed, so
      // there is nobody to show an error to. The old guard also required
      // the ref to have moved on, which is false on unmount - so closing
      // the drawer mid-lookup set state on a dead component.
      if (run.signal.aborted) return;
      setError(err instanceof Error ? err.message : "The lookup failed.");
    } finally {
      clearTimeout(timeout);
      if (runRef.current === run) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => runRef.current?.abort();
  }, [load]);

  // One shared timer: copying the v6 address and then the v4 within the
  // window used to cut the second tick short, and a pending timer could
  // fire after the panel closed.
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(copyTimer.current ?? undefined), []);

  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(value);
    clearTimeout(copyTimer.current ?? undefined);
    copyTimer.current = setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="bg-muted/50 rounded-xl p-4">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <Globe className="size-3.5" />
            Your public address
          </span>
          {info && <span className="font-medium">{info.family}</span>}
        </div>

        {error ? (
          <p className="text-destructive mt-2 text-sm">{error}</p>
        ) : (
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <span
              className={cn(
                "font-mono text-lg leading-tight break-all",
                !info && "text-muted-foreground",
              )}
            >
              {info ? info.ip : busy ? "Looking up…" : "—"}
            </span>
            {info && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={() => copy(info.ip)}
                aria-label="Copy address"
              >
                {copied === info.ip ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            )}
          </div>
        )}

        {info?.ipv4 && (
          <div className="mt-3 border-t pt-2">
            <div className="text-muted-foreground text-xs">Also reachable on IPv4</div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="font-mono text-sm break-all">{info.ipv4}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={() => copy(info.ipv4!)}
                aria-label="Copy IPv4 address"
              >
                {copied === info.ipv4 ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {info && (
        <dl className="divide-y rounded-xl border text-sm">
          <Fact label="Location" value={[info.flag, placeOf(info)].filter(Boolean).join(" ")} />
          <Fact label="Postcode" value={info.postal} />
          <Fact
            label="Provider"
            value={info.isp}
            note={info.asn ? `AS${info.asn}` : undefined}
          />
          <Fact
            label="Time zone"
            value={info.timezone}
            note={info.utcOffset ? `UTC${info.utcOffset}` : undefined}
          />
        </dl>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
          {busy ? "Checking…" : "Check again"}
        </Button>
      </div>

      {/* The one tool here that has to talk to someone else, so it says
          who, rather than leaving it to be discovered in the network tab. */}
      <p className="text-muted-foreground mt-auto text-xs">
        Your address is read back by ipwho.is
        {info?.ipv4 ? ", and ipify for the IPv4 line" : ""}. Alcove has no server of
        its own, and nothing else about you is sent.
      </p>
    </div>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value?: string;
  note?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="text-muted-foreground shrink-0 text-xs">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="break-words">{value}</span>
        {note && <span className="text-muted-foreground ml-1.5 text-xs">{note}</span>}
      </dd>
    </div>
  );
}
