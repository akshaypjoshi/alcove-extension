import { useState } from "react";
import { Search } from "lucide-react";
import { SEARCH_ENGINES } from "@/lib/settings";
import { runSearch } from "@/lib/search";

export default function SearchBar({ engineId }: { engineId: string }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const engine = SEARCH_ENGINES[engineId] ?? SEARCH_ENGINES.google;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query, engine.url, engineId);
  };

  return (
    <form
      onSubmit={submit}
      className="rise w-full max-w-2xl"
      style={{ animationDelay: "200ms" }}
    >
      <div className="glass focus-within:ring-[color:var(--glass-highlight)] flex items-center gap-4 rounded-2xl px-5 py-3.5 transition duration-300 focus-within:ring-2 hover:bg-[var(--glass-fill-hover)]">
        <Search className="text-on-wallpaper size-[18px] shrink-0 opacity-55" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={`Search ${engine.label}, or type a URL`}
          className="text-on-wallpaper placeholder:text-on-wallpaper/45 w-full bg-transparent text-base outline-none"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        {/* Mirrors the "/" shortcut the page listens for. Hidden once
            focused, where it would just be noise. */}
        {!focused && !query && (
          <kbd className="text-on-wallpaper border-[var(--glass-line)] hidden shrink-0 rounded-md border px-2 py-0.5 font-sans text-[11px] opacity-50 sm:block">
            /
          </kbd>
        )}
      </div>
    </form>
  );
}
