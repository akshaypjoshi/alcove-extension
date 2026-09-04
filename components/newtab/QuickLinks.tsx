import { useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { initials, normalizeUrl } from "@/lib/favicon";
import { useFavicon } from "@/lib/hooks/useFavicon";
import type { QuickLink } from "@/lib/settings";

function LinkIcon({ link, fetchIcons }: { link: QuickLink; fetchIcons: boolean }) {
  const [failed, setFailed] = useState(false);
  // The hook runs unconditionally - an emoji override is a render-time
  // choice, and skipping the call for those links would break hook order
  // the moment someone clears the field.
  const src = useFavicon(link.url, fetchIcons);

  if (link.icon) return <span className="text-[17px] leading-none">{link.icon}</span>;
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className="size-[18px] rounded object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="text-xs font-semibold">{initials(link.title)}</span>;
}

/**
 * A hover-expanding rail: 3.25rem of icons at rest, 13rem with labels once
 * the pointer is inside. Keeps the wallpaper visible while still being a
 * real, labelled nav for anyone who has more than five links.
 */
export default function QuickLinks({
  links,
  fetchIcons,
  side = "left",
  onChange,
  onOpenSettings,
}: {
  links: QuickLink[];
  fetchIcons: boolean;
  side?: "left" | "right";
  onChange: (links: QuickLink[]) => void;
  onOpenSettings: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const theme = useThemeToggle();

  const add = () => {
    const href = normalizeUrl(url);
    if (!href) return;
    let label = title.trim();
    if (!label) {
      try {
        label = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        label = href;
      }
    }
    onChange([...links, { id: crypto.randomUUID(), title: label, url: href }]);
    setTitle("");
    setUrl("");
    setAdding(false);
  };

  return (
    <>
      <nav
        className={cn(
          "group/rail glass rise fixed top-1/2 z-20 w-15 -translate-y-1/2 rounded-2xl p-2 transition-[width] duration-300 ease-out hover:w-56",
          side === "left" ? "left-5" : "right-5",
        )}
        style={{ animationDelay: "340ms" }}
      >
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                className="text-on-wallpaper flex items-center gap-3.5 rounded-xl px-2.5 py-2.5 transition hover:bg-[var(--glass-fill-hover)]"
                title={link.title}
              >
                <span className="flex size-[18px] shrink-0 items-center justify-center">
                  <LinkIcon link={link} fetchIcons={fetchIcons} />
                </span>
                <span className="truncate text-sm opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100">
                  {link.title}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-1 flex flex-col gap-1 mt-1.5 border-t border-[var(--glass-line)] pt-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setAdding(true)}
                className="text-on-wallpaper flex items-center gap-3.5 rounded-xl px-2.5 py-2.5 transition hover:bg-[var(--glass-fill-hover)]"
              >
                <Plus className="size-[18px] shrink-0" />
                <span className="truncate text-sm opacity-0 transition-opacity group-hover/rail:opacity-100">
                  Add link
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Add a quick link</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={theme.cycle}
                className="text-on-wallpaper flex items-center gap-3.5 rounded-xl px-2.5 py-2.5 transition hover:bg-[var(--glass-fill-hover)]"
              >
                <theme.icon className="size-[18px] shrink-0" />
                <span className="truncate text-sm opacity-0 transition-opacity group-hover/rail:opacity-100">
                  {theme.label}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Switch to {theme.nextLabel.toLowerCase()}
            </TooltipContent>
          </Tooltip>

          <button
            onClick={onOpenSettings}
            className="text-on-wallpaper flex items-center gap-3.5 rounded-xl px-2.5 py-2.5 transition hover:bg-[var(--glass-fill-hover)]"
          >
            <Settings2 className="size-[18px] shrink-0" />
            <span className="truncate text-sm opacity-0 transition-opacity group-hover/rail:opacity-100">
              Manage
            </span>
          </button>
        </div>
      </nav>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a quick link</DialogTitle>
            <DialogDescription>
              The title is optional - the hostname is used if you leave it blank.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ql-url">URL</Label>
              <Input
                id="ql-url"
                autoFocus
                value={url}
                placeholder="news.ycombinator.com"
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ql-title">Title</Label>
              <Input
                id="ql-title"
                value={title}
                placeholder="Hacker News"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={!url.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
