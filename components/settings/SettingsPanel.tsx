import { useEffect, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Plus,
  GripVertical,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROVIDER_LIST, getProvider } from "@/lib/ai/providers";
import type { ModelInfo } from "@/lib/ai/types";
import {
  SEARCH_ENGINES,
  WIDGET_PLACEMENTS,
  type DockPosition,
  type WidgetPlacement,
  type WidgetSize,
  useApiKeys,
  useSettings,
  type QuickLink,
  type Settings,
} from "@/lib/settings";
import { TOOLS } from "@/lib/tools";
import type { RecentSource } from "@/lib/recents";
import { WIDGETS, resolveConfig } from "@/lib/widgets";
import { WIDGET_SIZE_LABEL } from "@/components/widgets/WidgetCard";
import { searchLocations, type WeatherLocation } from "@/lib/weather";
import { clearFaviconCache, normalizeUrl } from "@/lib/favicon";
import {
  GRADIENTS,
  addWallpaper,
  deleteWallpaper,
  listWallpapers,
  type WallpaperRecord,
} from "@/lib/wallpapers";
import { cn } from "@/lib/utils";


function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function AppearanceTab({ settings, update }: TabProps) {
  return (
    <div className="divide-y">
      <Row label="Theme" hint="Applies to panels and menus, not the wallpaper">
        <Select value={settings.theme} onValueChange={(v) => update({ theme: v as Settings["theme"] })}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <Row label="Layout" hint="Where the clock and search sit">
        <Select value={settings.layout} onValueChange={(v) => update({ layout: v as Settings["layout"] })}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="center">Centred</SelectItem>
            <SelectItem value="left">Left aligned</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <Row label="Your name" hint="Used in the greeting">
        <Input
          value={settings.displayName}
          placeholder="optional"
          className="h-8 w-40"
          onChange={(e) => update({ displayName: e.target.value })}
        />
      </Row>

      <Row label="Greeting">
        <Switch
          checked={settings.showGreeting}
          onCheckedChange={(v) => update({ showGreeting: v })}
        />
      </Row>

      <Row label="Clock">
        <Switch checked={settings.showClock} onCheckedChange={(v) => update({ showClock: v })} />
      </Row>

      <Row label="Clock format">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <Switch
              checked={settings.showSeconds}
              onCheckedChange={(v) => update({ showSeconds: v })}
            />
            Seconds
          </label>
          <Select
            value={settings.clockFormat}
            onValueChange={(v) => update({ clockFormat: v as Settings["clockFormat"] })}
          >
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">12-hour</SelectItem>
              <SelectItem value="24h">24-hour</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Row>

      <Row label="Search bar">
        <div className="flex items-center gap-3">
          <Select
            value={settings.searchEngine}
            onValueChange={(v) => update({ searchEngine: v })}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SEARCH_ENGINES).map(([id, engine]) => (
                <SelectItem key={id} value={id}>
                  {engine.menuLabel ?? engine.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Switch checked={settings.showSearch} onCheckedChange={(v) => update({ showSearch: v })} />
        </div>
      </Row>

      <Row
        label="Shortcut tiles"
        hint="Under the search bar. Asks for permission when you turn it on."
      >
        <div className="flex items-center gap-3">
          {settings.showRecent && (
            <>
              <Select
                value={settings.recentSource}
                onValueChange={(v) => update({ recentSource: v as RecentSource })}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="history">Recently visited</SelectItem>
                  <SelectItem value="topSites">Most visited</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={String(settings.recentCount)}
                onValueChange={(v) => update({ recentCount: Number(v) })}
              >
                <SelectTrigger size="sm" className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[4, 5, 6, 8, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Switch
            checked={settings.showRecent}
            onCheckedChange={(v) => update({ showRecent: v })}
          />
        </div>
      </Row>

      <Row label="Quick links rail">
        <Switch
          checked={settings.showQuickLinks}
          onCheckedChange={(v) => update({ showQuickLinks: v })}
        />
      </Row>

      <Row label="Tool dock">
        <Switch checked={settings.showTools} onCheckedChange={(v) => update({ showTools: v })} />
      </Row>

      {settings.showTools && (
        <div className="space-y-3 py-3">
          <Row label="Dock position" hint="On the left, the quick links rail moves across">
            <Select
              value={settings.dock.position}
              onValueChange={(v) =>
                update({ dock: { ...settings.dock, position: v as DockPosition } })
              }
            >
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">Bottom</SelectItem>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <div>
            <Label className="text-xs">Size · {settings.dock.size}px</Label>
            <Slider
              value={[settings.dock.size]}
              min={32}
              max={64}
              step={2}
              className="mt-2"
              onValueChange={([v]) => update({ dock: { ...settings.dock, size: v } })}
            />
          </div>

          <Row label="Magnification" hint="Icons swell under the pointer">
            <Switch
              checked={settings.dock.magnify}
              onCheckedChange={(v) => update({ dock: { ...settings.dock, magnify: v } })}
            />
          </Row>

          {settings.dock.magnify && (
            <div>
              <Label className="text-xs">
                Amount · {settings.dock.magnification.toFixed(2)}×
              </Label>
              <Slider
                value={[settings.dock.magnification]}
                min={1.1}
                max={2.2}
                step={0.05}
                className="mt-2"
                onValueChange={([v]) =>
                  update({ dock: { ...settings.dock, magnification: v } })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WallpaperTab({ settings, update }: TabProps) {
  const [library, setLibrary] = useState<WallpaperRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { wallpaper } = settings;

  const refresh = () => listWallpapers().then(setLibrary);
  useEffect(() => {
    refresh();
  }, []);

  const patch = (next: Partial<Settings["wallpaper"]>) =>
    update({ wallpaper: { ...wallpaper, ...next } });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      let lastId = "";
      for (const file of Array.from(files)) {
        const record = await addWallpaper(file);
        lastId = record.id;
      }
      await refresh();
      patch({ kind: "image", imageId: lastId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await deleteWallpaper(id);
    await refresh();
    if (wallpaper.imageId === id) patch({ imageId: null, kind: "gradient" });
  };

  return (
    <div className="space-y-4">
      <Tabs value={wallpaper.kind} onValueChange={(v) => patch({ kind: v as any })}>
        <TabsList className="w-full">
          <TabsTrigger value="gradient" className="flex-1">Gradient</TabsTrigger>
          <TabsTrigger value="image" className="flex-1">Your images</TabsTrigger>
          <TabsTrigger value="solid" className="flex-1">Solid</TabsTrigger>
        </TabsList>

        <TabsContent value="gradient" className="mt-3">
          <div className="grid grid-cols-4 gap-2">
            {GRADIENTS.map((g) => (
              <button
                key={g.id}
                onClick={() => patch({ gradientId: g.id })}
                className={cn(
                  "relative h-16 rounded-lg border-2 transition",
                  wallpaper.gradientId === g.id ? "border-primary" : "border-transparent hover:border-border",
                )}
                style={{ background: g.css }}
                title={g.label}
              >
                {wallpaper.gradientId === g.id && (
                  <Check className="absolute top-1 right-1 size-3.5 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="image" className="mt-3 space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(e.dataTransfer.files);
            }}
            className="hover:bg-accent/40 flex flex-col items-center gap-2 rounded-lg border border-dashed py-6 transition"
          >
            {busy ? (
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            ) : (
              <Upload className="text-muted-foreground size-5" />
            )}
            <p className="text-muted-foreground text-xs">
              Drop images here, or
              <button
                className="text-foreground ml-1 underline underline-offset-2"
                onClick={() => fileInput.current?.click()}
              >
                browse
              </button>
            </p>
            <p className="text-muted-foreground text-[11px]">
              Stored on this device only, resized to 2560px
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => upload(e.target.files)}
            />
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}

          {library.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {library.map((record) => (
                  <Thumb
                    key={record.id}
                    record={record}
                    selected={wallpaper.imageId === record.id}
                    onSelect={() => patch({ kind: "image", imageId: record.id })}
                    onDelete={() => remove(record.id)}
                  />
                ))}
              </div>
              <Row label="Shuffle" hint="A different image on every new tab">
                <Switch checked={wallpaper.shuffle} onCheckedChange={(v) => patch({ shuffle: v })} />
              </Row>
            </>
          )}
        </TabsContent>

        <TabsContent value="solid" className="mt-3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={wallpaper.color}
              onChange={(e) => patch({ color: e.target.value })}
              className="size-9 cursor-pointer rounded-md border bg-transparent"
            />
            <Input
              value={wallpaper.color}
              className="font-mono"
              onChange={(e) => patch({ color: e.target.value })}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Separator />

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Blur · {wallpaper.blur}px</Label>
          <Slider
            value={[wallpaper.blur]}
            max={24}
            step={1}
            className="mt-2"
            onValueChange={([v]) => patch({ blur: v })}
          />
        </div>
        <div>
          <Label className="text-xs">Dim · {wallpaper.dim}%</Label>
          <Slider
            value={[wallpaper.dim]}
            max={80}
            step={1}
            className="mt-2"
            onValueChange={([v]) => patch({ dim: v })}
          />
        </div>
      </div>
    </div>
  );
}

function Thumb({
  record,
  selected,
  onSelect,
  onDelete,
}: {
  record: WallpaperRecord;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(record.thumb);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [record.thumb]);

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={cn(
          "block h-20 w-full overflow-hidden rounded-lg border-2 transition",
          selected ? "border-primary" : "border-transparent hover:border-border",
        )}
      >
        {url && <img src={url} alt={record.name} className="size-full object-cover" />}
      </button>
      <button
        onClick={onDelete}
        className="bg-background/90 absolute top-1 right-1 rounded-md border p-1 opacity-0 transition group-hover:opacity-100"
        aria-label={`Delete ${record.name}`}
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}


function LocationPicker({ settings, update }: TabProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const current = settings.weather.location;

  // Debounced, and aborted on every keystroke — the geocoder answers fast
  // enough that un-cancelled requests routinely land out of order.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      searchLocations(term, controller.signal)
        .then(setResults)
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = (location: WeatherLocation) => {
    update({ weather: { ...settings.weather, location } });
    setQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Weather location</div>
          <div className="text-muted-foreground text-xs">
            {current
              ? [current.name, current.admin, current.country].filter(Boolean).join(", ")
              : "No city chosen yet"}
          </div>
        </div>
        <Select
          value={settings.weather.units}
          onValueChange={(units) =>
            update({ weather: { ...settings.weather, units: units as "metric" | "imperial" } })
          }
        >
          <SelectTrigger size="sm" className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="metric">°C, km/h</SelectItem>
            <SelectItem value="imperial">°F, mph</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="relative">
        <Input
          value={query}
          placeholder="Search for a city…"
          onChange={(e) => setQuery(e.target.value)}
        />
        {busy && (
          <Loader2 className="text-muted-foreground absolute top-2.5 right-3 size-4 animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <ul className="overflow-hidden rounded-lg border">
          {results.map((location) => (
            <li key={`${location.latitude},${location.longitude}`}>
              <button
                onClick={() => choose(location)}
                className="hover:bg-accent flex w-full items-center justify-between px-3 py-2 text-left text-sm"
              >
                <span>{location.name}</span>
                <span className="text-muted-foreground text-xs">
                  {[location.admin, location.country].filter(Boolean).join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Keyed by instance id, not widget type. The registry allows several
 * instances of the same widget — four clocks in four zones is the whole
 * point of the clock widget — so a type-keyed edit would rewrite every
 * one of them at once, and a type-keyed toggle would delete them all.
 */
function WidgetsTab({ settings, update }: TabProps) {
  const instances = settings.widgets;

  const add = (type: string) => {
    const def = WIDGETS.find((w) => w.type === type)!;
    update({
      widgets: [
        ...instances,
        {
          id: crypto.randomUUID(),
          type,
          size: def.defaultSize,
          placement: "top-right" as WidgetPlacement,
        },
      ],
    });
  };

  const remove = (id: string) =>
    update({ widgets: instances.filter((w) => w.id !== id) });

  const patch = (id: string, changes: Partial<(typeof instances)[number]>) =>
    update({
      widgets: instances.map((w) => (w.id === id ? { ...w, ...changes } : w)),
    });

  const configure = (id: string, key: string, value: string) => {
    const current = instances.find((w) => w.id === id);
    patch(id, { config: { ...current?.config, [key]: value } });
  };

  return (
    <div className="space-y-5">
      <div className="divide-y">
        <Row
          label="Show widgets"
          hint="On the page: drag to move, hover to resize or remove"
        >
          <Switch
            checked={settings.showWidgets}
            onCheckedChange={(v) => update({ showWidgets: v })}
          />
        </Row>

        {WIDGETS.map((widget) => {
          const mine = instances.filter((w) => w.type === widget.type);

          return (
            <div key={widget.type} className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{widget.label}</div>
                  <div className="text-muted-foreground text-xs">{widget.description}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  onClick={() => add(widget.type)}
                >
                  <Plus className="size-3.5" /> Add
                </Button>
              </div>

              {mine.length === 0 ? (
                <p className="text-muted-foreground text-xs">Not on the page.</p>
              ) : (
                mine.map((instance) => {
                  const config = resolveConfig(widget, instance);
                  return (
                    <div
                      key={instance.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
                    >
                      {widget.options?.map((option) => (
                        <Select
                          key={option.key}
                          value={config[option.key]}
                          onValueChange={(v) => configure(instance.id, option.key, v)}
                        >
                          <SelectTrigger size="sm" className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {option.choices(settings).map((choice) => (
                              <SelectItem key={choice.id} value={choice.id}>
                                {choice.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ))}

                      {widget.sizes.length > 1 && (
                        <Select
                          value={instance.size}
                          onValueChange={(v) => patch(instance.id, { size: v as WidgetSize })}
                        >
                          <SelectTrigger size="sm" className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {widget.sizes.map((size) => (
                              <SelectItem key={size} value={size}>
                                {WIDGET_SIZE_LABEL[size]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Drag-to-place is the primary gesture; this is the
                          keyboard-reachable equivalent. */}
                      <Select
                        value={instance.placement}
                        onValueChange={(v) =>
                          patch(instance.id, { placement: v as WidgetPlacement })
                        }
                      >
                        <SelectTrigger size="sm" className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WIDGET_PLACEMENTS.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto size-7"
                        onClick={() => remove(instance.id)}
                        aria-label={`Remove ${widget.label}`}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      <Separator />
      <LocationPicker settings={settings} update={update} />
    </div>
  );
}

function LinksTab({ settings, update }: TabProps) {
  const links = settings.quickLinks;
  const [cleared, setCleared] = useState(false);

  const patch = (id: string, next: Partial<QuickLink>) =>
    update({ quickLinks: links.map((l) => (l.id === id ? { ...l, ...next } : l)) });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    [next[index], next[target]] = [next[target], next[index]];
    update({ quickLinks: next });
  };

  return (
    <div className="space-y-2">
      <div className="divide-y">
        <Row
          label="Fetch site icons"
          hint="Once per site, then cached offline. Off uses Chrome's own favicon cache."
        >
          <Switch
            checked={settings.fetchLinkIcons}
            onCheckedChange={(v) => update({ fetchLinkIcons: v })}
          />
        </Row>
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="text-muted-foreground text-xs">
            An emoji in the first column overrides the fetched icon.
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0"
            onClick={async () => {
              await clearFaviconCache();
              setCleared(true);
              setTimeout(() => setCleared(false), 1500);
            }}
          >
            {cleared ? <Check className="size-3.5 text-emerald-500" /> : null}
            {cleared ? "Cleared" : "Clear icon cache"}
          </Button>
        </div>
      </div>

      {links.map((link, index) => (
        <div key={link.id} className="flex items-center gap-1.5">
          <div className="flex flex-col">
            <button
              className="text-muted-foreground hover:text-foreground -mb-1 text-[10px] leading-none disabled:opacity-30"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              ▲
            </button>
            <GripVertical className="text-muted-foreground size-3" />
            <button
              className="text-muted-foreground hover:text-foreground -mt-1 text-[10px] leading-none disabled:opacity-30"
              onClick={() => move(index, 1)}
              disabled={index === links.length - 1}
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
          <Input
            value={link.icon ?? ""}
            placeholder="🔗"
            className="w-12 px-0 text-center"
            maxLength={2}
            onChange={(e) => patch(link.id, { icon: e.target.value || undefined })}
          />
          <Input
            value={link.title}
            className="w-32"
            onChange={(e) => patch(link.id, { title: e.target.value })}
          />
          <Input
            value={link.url}
            className="flex-1 font-mono text-xs"
            onChange={(e) => patch(link.id, { url: e.target.value })}
            onBlur={(e) => patch(link.id, { url: normalizeUrl(e.target.value) })}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={() => update({ quickLinks: links.filter((l) => l.id !== link.id) })}
            aria-label={`Remove ${link.title}`}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() =>
          update({
            quickLinks: [
              ...links,
              { id: crypto.randomUUID(), title: "New link", url: "https://" },
            ],
          })
        }
      >
        Add link
      </Button>
    </div>
  );
}

function ToolsTab({ settings, update }: TabProps) {
  const toggle = (id: string, on: boolean) =>
    update({
      enabledTools: on
        ? [...settings.enabledTools, id]
        : settings.enabledTools.filter((t) => t !== id),
    });

  return (
    <div className="divide-y">
      {TOOLS.map((tool) => (
        <Row key={tool.id} label={tool.label} hint={tool.description}>
          <Switch
            checked={settings.enabledTools.includes(tool.id)}
            onCheckedChange={(v) => toggle(tool.id, v)}
          />
        </Row>
      ))}
    </div>
  );
}

function AiTab({ settings, update }: TabProps) {
  const { keys, setKey } = useApiKeys();
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "bad">("idle");

  const providerId = settings.ai.providerId;
  const provider = PROVIDER_LIST.find((p) => p.id === providerId) ?? PROVIDER_LIST[0];
  const key = keys[providerId] ?? "";

  useEffect(() => {
    setStatus("idle");
    setModels(null);
  }, [providerId]);

  const check = async () => {
    setStatus("checking");
    const ok = await getProvider(providerId).validateKey(key);
    setStatus(ok ? "ok" : "bad");
    if (ok) {
      getProvider(providerId)
        .listModels?.(key)
        .then(setModels)
        .catch(() => setModels(null));
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Provider</Label>
        <Select
          value={providerId}
          onValueChange={(id) => {
            const next = PROVIDER_LIST.find((p) => p.id === id)!;
            update({ ai: { ...settings.ai, providerId: id, model: next.defaultModel } });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_LIST.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="api-key">API key</Label>
          <a
            href={provider.keyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            Get one <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="flex gap-2">
          <Input
            id="api-key"
            type="password"
            value={key}
            placeholder={providerId === "ollama" ? "not needed for local" : "sk-…"}
            className="font-mono"
            onChange={(e) => {
              setKey(providerId, e.target.value);
              setStatus("idle");
            }}
          />
          <Button variant="outline" onClick={check} disabled={status === "checking"}>
            {status === "checking" ? <Loader2 className="size-4 animate-spin" /> : "Test"}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {status === "ok"
            ? "Key works."
            : status === "bad"
              ? "That key was rejected."
              : "Stored in local extension storage on this device — never synced, never sent anywhere but the provider."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Model</Label>
        <Select
          value={settings.ai.model}
          onValueChange={(model) => update({ ai: { ...settings.ai, model } })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {(models ?? provider.models).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="system">System prompt</Label>
        <Textarea
          id="system"
          value={settings.ai.systemPrompt}
          rows={4}
          className="text-xs"
          onChange={(e) => update({ ai: { ...settings.ai, systemPrompt: e.target.value } })}
        />
      </div>
    </div>
  );
}


function AboutTab({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-medium">Alcove</h3>
        <p className="text-muted-foreground text-xs">
          A calmer new tab, with a chat that follows you around. Everything —
          wallpapers, notes, links, keys — stays on your machine.
        </p>
      </div>

      <Separator />

      <dl className="text-muted-foreground space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt>Toggle chat on any page</dt>
          <dd className="font-mono">⌘⇧Y / Ctrl+Shift+Y</dd>
        </div>
        <div className="flex justify-between">
          <dt>Wallpapers &amp; notes</dt>
          <dd>IndexedDB, this device</dd>
        </div>
        <div className="flex justify-between">
          <dt>Settings &amp; links</dt>
          <dd>Browser sync storage</dd>
        </div>
        <div className="flex justify-between">
          <dt>API keys</dt>
          <dd>Local storage, never synced</dd>
        </div>
      </dl>

      <Separator />

      <Button variant="outline" size="sm" onClick={reset}>
        Reset all settings
      </Button>
    </div>
  );
}

interface TabProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function SettingsPanel() {
  const { settings, update, reset } = useSettings();

  if (!settings) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  const props: TabProps = { settings, update };

  return (
    <Tabs defaultValue="appearance" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="appearance">Look</TabsTrigger>
        <TabsTrigger value="wallpaper">Wallpaper</TabsTrigger>
        <TabsTrigger value="widgets">Widgets</TabsTrigger>
        <TabsTrigger value="links">Links</TabsTrigger>
        <TabsTrigger value="tools">Tools</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>

      <div className="mt-4 min-h-[22rem]">
        <TabsContent value="appearance"><AppearanceTab {...props} /></TabsContent>
        <TabsContent value="wallpaper"><WallpaperTab {...props} /></TabsContent>
        <TabsContent value="widgets"><WidgetsTab {...props} /></TabsContent>
        <TabsContent value="links"><LinksTab {...props} /></TabsContent>
        <TabsContent value="tools"><ToolsTab {...props} /></TabsContent>
        <TabsContent value="ai"><AiTab {...props} /></TabsContent>
        <TabsContent value="about"><AboutTab reset={reset} /></TabsContent>
      </div>
    </Tabs>
  );
}
