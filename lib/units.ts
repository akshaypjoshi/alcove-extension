/**
 * Every unit is expressed as a factor to its category's base unit, so a
 * conversion is one multiply and one divide. Temperature is the exception
 * - it's affine, not linear - so it carries explicit to/from functions.
 */

export interface Unit {
  id: string;
  label: string;
  /** Multiply by this to reach the base unit. */
  factor?: number;
  toBase?: (n: number) => number;
  fromBase?: (n: number) => number;
}

export interface UnitCategory {
  id: string;
  label: string;
  units: Unit[];
  defaults: [string, string];
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "length",
    label: "Length",
    defaults: ["km", "mi"],
    units: [
      { id: "mm", label: "Millimetre", factor: 0.001 },
      { id: "cm", label: "Centimetre", factor: 0.01 },
      { id: "m", label: "Metre", factor: 1 },
      { id: "km", label: "Kilometre", factor: 1000 },
      { id: "in", label: "Inch", factor: 0.0254 },
      { id: "ft", label: "Foot", factor: 0.3048 },
      { id: "yd", label: "Yard", factor: 0.9144 },
      { id: "mi", label: "Mile", factor: 1609.344 },
      { id: "nmi", label: "Nautical mile", factor: 1852 },
    ],
  },
  {
    id: "mass",
    label: "Mass",
    defaults: ["kg", "lb"],
    units: [
      { id: "mg", label: "Milligram", factor: 1e-6 },
      { id: "g", label: "Gram", factor: 0.001 },
      { id: "kg", label: "Kilogram", factor: 1 },
      { id: "t", label: "Tonne", factor: 1000 },
      { id: "oz", label: "Ounce", factor: 0.028349523125 },
      { id: "lb", label: "Pound", factor: 0.45359237 },
      { id: "st", label: "Stone", factor: 6.35029318 },
    ],
  },
  {
    id: "temperature",
    label: "Temperature",
    defaults: ["c", "f"],
    units: [
      { id: "c", label: "Celsius", toBase: (n) => n, fromBase: (n) => n },
      {
        id: "f",
        label: "Fahrenheit",
        toBase: (n) => ((n - 32) * 5) / 9,
        fromBase: (n) => (n * 9) / 5 + 32,
      },
      { id: "k", label: "Kelvin", toBase: (n) => n - 273.15, fromBase: (n) => n + 273.15 },
    ],
  },
  {
    id: "data",
    label: "Data",
    defaults: ["mb", "gb"],
    units: [
      { id: "b", label: "Byte", factor: 1 },
      { id: "kb", label: "Kilobyte (1000)", factor: 1e3 },
      { id: "mb", label: "Megabyte (1000)", factor: 1e6 },
      { id: "gb", label: "Gigabyte (1000)", factor: 1e9 },
      { id: "tb", label: "Terabyte (1000)", factor: 1e12 },
      { id: "kib", label: "Kibibyte (1024)", factor: 1024 },
      { id: "mib", label: "Mebibyte (1024)", factor: 1024 ** 2 },
      { id: "gib", label: "Gibibyte (1024)", factor: 1024 ** 3 },
      { id: "tib", label: "Tebibyte (1024)", factor: 1024 ** 4 },
    ],
  },
  {
    id: "speed",
    label: "Speed",
    defaults: ["kmh", "mph"],
    units: [
      { id: "ms", label: "Metres/second", factor: 1 },
      { id: "kmh", label: "Kilometres/hour", factor: 1 / 3.6 },
      { id: "mph", label: "Miles/hour", factor: 0.44704 },
      { id: "kn", label: "Knot", factor: 0.514444 },
    ],
  },
  {
    id: "area",
    label: "Area",
    defaults: ["m2", "ft2"],
    units: [
      { id: "cm2", label: "Square centimetre", factor: 1e-4 },
      { id: "m2", label: "Square metre", factor: 1 },
      { id: "km2", label: "Square kilometre", factor: 1e6 },
      { id: "ft2", label: "Square foot", factor: 0.09290304 },
      { id: "ac", label: "Acre", factor: 4046.8564224 },
      { id: "ha", label: "Hectare", factor: 10000 },
    ],
  },
  {
    id: "volume",
    label: "Volume",
    defaults: ["l", "galus"],
    units: [
      { id: "ml", label: "Millilitre", factor: 0.001 },
      { id: "l", label: "Litre", factor: 1 },
      { id: "m3", label: "Cubic metre", factor: 1000 },
      { id: "cup", label: "Cup (US)", factor: 0.2365882365 },
      { id: "pt", label: "Pint (US)", factor: 0.473176473 },
      { id: "galus", label: "Gallon (US)", factor: 3.785411784 },
      { id: "galuk", label: "Gallon (UK)", factor: 4.54609 },
    ],
  },
  {
    id: "time",
    label: "Time",
    defaults: ["h", "min"],
    units: [
      { id: "ms", label: "Millisecond", factor: 0.001 },
      { id: "s", label: "Second", factor: 1 },
      { id: "min", label: "Minute", factor: 60 },
      { id: "h", label: "Hour", factor: 3600 },
      { id: "d", label: "Day", factor: 86400 },
      { id: "wk", label: "Week", factor: 604800 },
      { id: "yr", label: "Year (365d)", factor: 31536000 },
    ],
  },
];

export function convert(value: number, from: Unit, to: Unit): number {
  const base = from.toBase ? from.toBase(value) : value * (from.factor ?? 1);
  return to.fromBase ? to.fromBase(base) : base / (to.factor ?? 1);
}

export function findUnit(category: UnitCategory, id: string): Unit {
  return category.units.find((u) => u.id === id) ?? category.units[0];
}
