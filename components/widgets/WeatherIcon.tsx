import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { describe } from "@/lib/weather";
import { cn } from "@/lib/utils";

/** Only "clear" and "partly" have a night form; rain looks like rain at 2am. */
const DAY: Record<string, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
};

const NIGHT: Record<string, LucideIcon> = {
  clear: Moon,
  partly: CloudMoon,
};

export default function WeatherIcon({
  code,
  isDay,
  className,
}: {
  code: number;
  isDay: boolean;
  className?: string;
}) {
  const { icon, label } = describe(code);
  const Icon = (!isDay && NIGHT[icon]) || DAY[icon] || Cloud;
  return <Icon className={cn("shrink-0", className)} aria-label={label} />;
}
