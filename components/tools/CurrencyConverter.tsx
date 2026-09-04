import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMON_CURRENCIES, convertCurrency, getRates } from "@/lib/currency";

export default function CurrencyConverter() {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");

  const load = async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      const data = await getRates(force);
      setRates(data.rates);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load rates.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const result = useMemo(() => {
    if (!rates) return null;
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    const value = convertCurrency(n, from, to, rates);
    return value?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? null;
  }, [amount, from, to, rates]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={amount}
          inputMode="decimal"
          className="flex-1 font-mono"
          onChange={(e) => setAmount(e.target.value)}
        />
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-center">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          aria-label="Swap currencies"
        >
          <ArrowLeftRight className="size-4" />
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="bg-muted/60 flex flex-1 items-center rounded-md px-3 font-mono text-sm">
          {busy && !rates ? "Loading…" : (result ?? "-")}
        </div>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>
          {error
            ? error
            : fetchedAt
              ? `Rates from ${new Date(fetchedAt).toLocaleDateString()}`
              : ""}
        </span>
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => load(true)} disabled={busy}>
          <RefreshCw className={busy ? "size-3 animate-spin" : "size-3"} /> Refresh
        </Button>
      </div>
    </div>
  );
}
