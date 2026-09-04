import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNIT_CATEGORIES, convert, findUnit } from "@/lib/units";

export default function UnitConverter() {
  const [categoryId, setCategoryId] = useState(UNIT_CATEGORIES[0].id);
  const category = UNIT_CATEGORIES.find((c) => c.id === categoryId)!;

  const [from, setFrom] = useState(category.defaults[0]);
  const [to, setTo] = useState(category.defaults[1]);
  const [amount, setAmount] = useState("1");

  const switchCategory = (id: string) => {
    const next = UNIT_CATEGORIES.find((c) => c.id === id)!;
    setCategoryId(id);
    // Unit ids aren't unique across categories ("ms" is both millisecond
    // and metres/second), so always reset to the new category's defaults.
    setFrom(next.defaults[0]);
    setTo(next.defaults[1]);
  };

  const result = useMemo(() => {
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    const value = convert(n, findUnit(category, from), findUnit(category, to));
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }, [amount, category, from, to]);

  return (
    <div className="space-y-3">
      <Select value={categoryId} onValueChange={switchCategory}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNIT_CATEGORIES.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={amount}
            inputMode="decimal"
            className="flex-1 font-mono"
            onChange={(e) => setAmount(e.target.value)}
          />
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger className="w-[46%]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {category.units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
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
            aria-label="Swap units"
          >
            <ArrowLeftRight className="size-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="bg-muted/60 flex flex-1 items-center rounded-md px-3 font-mono text-sm">
            {result ?? "—"}
          </div>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger className="w-[46%]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {category.units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
