import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import WallpaperLayer from "@/components/newtab/WallpaperLayer";
import { useFavicon } from "@/lib/hooks/useFavicon";
import { GRADIENTS, addWallpaper, gradientCss } from "@/lib/wallpapers";
import { hostOf, normalizeUrl } from "@/lib/favicon";
import { TOOLS } from "@/lib/tools";
import { useSettings, type QuickLink } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * What a new install opens instead of the settings panel.
 *
 * The panel is every option at once, which reads as assembly required to
 * someone who has not seen the page yet. This asks for the three things
 * that make it stop looking like a demo, in the order they matter, and
 * every choice lands on the real wallpaper behind the card so the effect
 * of each one is visible while making it.
 */
const STEPS = ["Wallpaper", "Links", "You"] as const;

export default function Welcome() {
  const { settings, update } = useSettings();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  useTheme(settings?.theme);

  if (!settings) return <div className="bg-background h-screen" />;

  const finish = async () => {
    await update({ onboarded: true });
    setDone(true);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      {/* The real thing, not a mockup of it. */}
      <WallpaperLayer wallpaper={settings.wallpaper} />

      <div className="glass-strong text-on-wallpaper rise relative z-10 flex w-full max-w-xl flex-col gap-5 rounded-3xl p-7">
        {done ? (
          <Done />
        ) : (
          <>
            <header className="flex flex-col gap-1">
              <p className="text-xs tracking-[0.14em] uppercase opacity-60">
                Step {step + 1} of {STEPS.length}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                {step === 0 && "Make it yours"}
                {step === 1 && "The links you actually use"}
                {step === 2 && "Last thing"}
              </h1>
              <p className="text-sm opacity-70">
                {step === 0 && "Pick a background. Drop in a photo of your own, or start with a gradient."}
                {step === 1 && "These are placeholders. Swap them for the sites you open every day."}
                {step === 2 && "Your name for the greeting, and which tools sit in the dock."}
              </p>
            </header>

            {step === 0 && <WallpaperStep settings={settings} update={update} />}
            {step === 1 && <LinksStep settings={settings} update={update} />}
            {step === 2 && <YouStep settings={settings} update={update} />}

            <footer className="flex items-center justify-between gap-3 border-t border-[var(--glass-line)] pt-4">
              <div className="flex gap-1.5">
                {STEPS.map((name, i) => (
                  <span
                    key={name}
                    aria-hidden
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === step ? "w-5 bg-current opacity-80" : "w-1.5 bg-current opacity-30",
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={finish}>
                  Skip
                </Button>
                {step > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}
                >
                  {step === STEPS.length - 1 ? "Done" : "Next"}
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

type StepProps = {
  settings: NonNullable<ReturnType<typeof useSettings>["settings"]>;
  update: ReturnType<typeof useSettings>["update"];
};

function WallpaperStep({ settings, update }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const record = await addWallpaper(file);
      await update({
        wallpaper: { ...settings.wallpaper, kind: "image", imageId: record.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That image could not be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        {GRADIENTS.map((gradient) => {
          const active =
            settings.wallpaper.kind === "gradient" &&
            settings.wallpaper.gradientId === gradient.id;
          return (
            <button
              key={gradient.id}
              onClick={() =>
                update({
                  wallpaper: { ...settings.wallpaper, kind: "gradient", gradientId: gradient.id },
                })
              }
              aria-label={gradient.label}
              aria-pressed={active}
              style={{ background: gradientCss(gradient.id) }}
              className={cn(
                "h-14 rounded-xl transition",
                active
                  ? "ring-2 ring-[color:var(--glass-highlight)] ring-offset-2 ring-offset-transparent"
                  : "opacity-80 hover:opacity-100",
              )}
            />
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <Button
        variant="outline"
        // Drop as well as click: dragging a photo in is the gesture people
        // reach for, and it is the whole point of this step.
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="h-20 border-dashed"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <ImagePlus className="size-4" /> Drop a photo here, or choose one
          </>
        )}
      </Button>

      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function LinksStep({ settings, update }: StepProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const links = settings.quickLinks;

  const add = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const full = normalizeUrl(trimmed);
    update({
      quickLinks: [
        ...links,
        { id: crypto.randomUUID(), title: title.trim() || hostOf(full) || full, url: full },
      ],
    });
    setTitle("");
    setUrl("");
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto">
        {links.map((link) => (
          <li key={link.id}>
            <LinkRow
              link={link}
              fetchIcons={settings.fetchLinkIcons}
              onRemove={() =>
                update({ quickLinks: links.filter((l) => l.id !== link.id) })
              }
            />
          </li>
        ))}
        {links.length === 0 && (
          <li className="py-4 text-center text-sm opacity-60">
            No links yet. Add the first one below.
          </li>
        )}
      </ul>

      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name (optional)"
          className="h-9 w-40"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="example.com"
          className="h-9 flex-1"
        />
        <Button size="icon" variant="outline" className="size-9 shrink-0" onClick={add} aria-label="Add link">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function LinkRow({
  link,
  fetchIcons,
  onRemove,
}: {
  link: QuickLink;
  fetchIcons: boolean;
  onRemove: () => void;
}) {
  const icon = useFavicon(link.url, fetchIcons);
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--glass-fill-hover)]">
      <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded">
        {link.icon ? (
          <span className="text-sm">{link.icon}</span>
        ) : icon ? (
          <img src={icon} alt="" className="size-4" />
        ) : (
          <span className="text-xs opacity-60">{link.title.slice(0, 1)}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{link.title}</span>
        <span className="block truncate text-xs opacity-55">{hostOf(link.url)}</span>
      </span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${link.title}`}
        className="rounded-full p-1 opacity-60 transition hover:bg-[var(--glass-fill-hover)] hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function YouStep({ settings, update }: StepProps) {
  const toggle = (id: string, on: boolean) =>
    update({
      enabledTools: on
        ? [...settings.enabledTools, id]
        : settings.enabledTools.filter((t) => t !== id),
    });

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">What should the greeting call you?</span>
        <Input
          value={settings.displayName}
          onChange={(e) => update({ displayName: e.target.value })}
          placeholder="Leave blank for no name"
          className="h-9"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm">Tools in the dock</span>
        <div className="flex flex-wrap gap-1.5">
          {TOOLS.map((tool) => {
            const on = settings.enabledTools.includes(tool.id);
            return (
              <button
                key={tool.id}
                onClick={() => toggle(tool.id, !on)}
                aria-pressed={on}
                title={tool.description}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  on
                    ? "border-transparent bg-[var(--glass-fill-hover)]"
                    : "border-[var(--glass-line)] opacity-55 hover:opacity-90",
                )}
              >
                {tool.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Done() {
  const [opening, setOpening] = useState(false);

  // The shortcut is the one thing nobody finds on their own, so it is the
  // last thing said rather than another setting.
  const mac = navigator.platform.toLowerCase().includes("mac");

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-[var(--glass-fill-hover)]">
        <Check className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">That is it</h1>
        <p className="text-sm opacity-75">
          Every new tab is yours now. One thing worth knowing: press{" "}
          <kbd className="rounded border border-[var(--glass-line)] bg-[var(--glass-fill-hover)] px-1.5 py-0.5 font-sans text-xs">
            {mac ? "⌘" : "Ctrl"} K
          </kbd>{" "}
          anywhere on the page to reach any tool, link or setting by typing.
        </p>
      </div>
      <Button
        size="sm"
        disabled={opening}
        onClick={() => {
          setOpening(true);
          browser.tabs.create({});
        }}
      >
        Open a new tab
      </Button>
    </div>
  );
}
