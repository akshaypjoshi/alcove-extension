import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { rank, searchCommand, type Command } from "@/lib/commands";
import { cn } from "@/lib/utils";

/**
 * One box that reaches everything.
 *
 * Results are a single ranked list rather than fixed sections once you
 * start typing: the best match for what you typed belongs at the top
 * whatever kind of thing it is, and the group name rides along on the row
 * so nothing is lost by dropping the headers. With an empty box the
 * registry order is kept, which reads as a menu rather than a ranking.
 */
export default function CommandPalette({
  open,
  onOpenChange,
  commands,
  onSearchWeb,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
  onSearchWeb: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const ranked = rank(commands, query);
    const trimmed = query.trim();
    // Only offered when nothing else matched, so it never pushes a real
    // command down the list.
    if (!ranked.length && trimmed) {
      return [searchCommand(trimmed, () => onSearchWeb(trimmed))];
    }
    return ranked;
  }, [commands, query, onSearchWeb]);

  // A reopened palette should start clean rather than resume a search the
  // user has long since finished with.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keeps the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runAt = (index: number) => {
    const command = results[index];
    if (!command) return;
    onOpenChange(false);
    command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault();
      setActive((i) =>
        results.length ? (i - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, results.length - 1));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // Sits high rather than centred: the list grows downwards, and a
        // vertically centred box jumps around as results come and go.
        className="top-[12%] max-h-[70vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        onKeyDown={onKeyDown}
        // Radix focuses the first tabbable child itself, which beats the
        // input's own autoFocus and leaves a keystroke after the shortcut
        // going nowhere. The whole point is to open and type.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools, links and settings…"
          aria-label="Search commands"
          className="placeholder:text-muted-foreground w-full border-b bg-transparent px-4 py-3.5 text-[15px] outline-none"
        />

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              Nothing matches that.
            </p>
          ) : (
            results.map((command, index) => {
              const Icon = command.icon;
              const selected = index === active;
              return (
                <button
                  key={command.id}
                  data-index={index}
                  onClick={() => runAt(index)}
                  onPointerMove={() => setActive(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected && "bg-accent",
                  )}
                >
                  <Icon className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{command.label}</span>
                    {command.hint && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {command.hint}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {selected ? (
                      <CornerDownLeft className="size-3.5" />
                    ) : (
                      command.group
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
