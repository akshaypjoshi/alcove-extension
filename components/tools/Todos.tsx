import { useEffect, useState } from "react";
import { storage } from "#imports";
import { Circle, CircleCheck, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

const store = storage.defineItem<Todo[]>("local:todos", { fallback: [] });

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    store.getValue().then((v) => {
      setTodos(v ?? []);
      setReady(true);
    });
    // Watched, not just read once: the list is open in the drawer on one
    // new tab while you tick something off on another.
    return store.watch((v) => setTodos(v ?? []));
  }, []);

  // Every mutation goes through here so state and storage can't drift.
  const commit = (next: Todo[]) => {
    setTodos(next);
    store.setValue(next);
  };

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    commit([
      ...todos,
      { id: crypto.randomUUID(), text, done: false, createdAt: Date.now() },
    ]);
    setDraft("");
  };

  const toggle = (id: string) =>
    commit(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const remove = (id: string) => commit(todos.filter((t) => t.id !== id));

  const remaining = todos.filter((t) => !t.done).length;
  // Done items sink to the bottom, keeping what's left at eye level.
  const ordered = [...todos].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder="Add a task…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button size="icon" className="shrink-0" onClick={add} disabled={!draft.trim()}>
          <Plus className="size-4" />
        </Button>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {ordered.map((todo) => (
          <li
            key={todo.id}
            className="group hover:bg-accent/50 flex items-start gap-2.5 rounded-lg px-2 py-1.5"
          >
            <button
              onClick={() => toggle(todo.id)}
              className="mt-0.5 shrink-0"
              aria-label={todo.done ? "Mark as not done" : "Mark as done"}
            >
              {todo.done ? (
                <CircleCheck className="size-4 text-emerald-500" />
              ) : (
                <Circle className="text-muted-foreground size-4" />
              )}
            </button>
            <span
              className={cn(
                "flex-1 text-sm leading-snug break-words",
                todo.done && "text-muted-foreground line-through",
              )}
            >
              {todo.text}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0 opacity-0 transition group-hover:opacity-100"
              onClick={() => remove(todo.id)}
              aria-label={`Remove ${todo.text}`}
            >
              <X className="size-3" />
            </Button>
          </li>
        ))}

        {ready && todos.length === 0 && (
          <li className="text-muted-foreground px-2 py-6 text-center text-sm">
            Nothing to do. Suspicious.
          </li>
        )}
      </ul>

      {todos.length > 0 && (
        <div className="text-muted-foreground flex items-center justify-between border-t pt-2 text-xs">
          <span>
            {remaining} {remaining === 1 ? "task" : "tasks"} left
          </span>
          {remaining < todos.length && (
            <button
              className="hover:text-foreground transition"
              onClick={() => commit(todos.filter((t) => !t.done))}
            >
              Clear done
            </button>
          )}
        </div>
      )}
    </div>
  );
}
