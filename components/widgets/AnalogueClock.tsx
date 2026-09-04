/**
 * Hands are rotated with SVG transforms rather than CSS transitions:
 * a transition on a hand that wraps 354° → 0° animates the long way round
 * once a minute, which is far more distracting than a one-second step.
 */
export default function AnalogueClock({
  hour,
  minute,
  second,
  showSecond = true,
  className,
}: {
  hour: number;
  minute: number;
  second: number;
  showSecond?: boolean;
  className?: string;
}) {
  // Hour and minute hands carry the fraction of the smaller unit, so the
  // hour hand sits between numerals instead of jumping on the hour.
  const hourAngle = ((hour % 12) + minute / 60) * 30;
  const minuteAngle = (minute + second / 60) * 6;
  const secondAngle = second * 6;

  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.18"
      />

      {Array.from({ length: 12 }, (_, i) => {
        const major = i % 3 === 0;
        return (
          <line
            key={i}
            x1="50"
            y1={major ? 9 : 11}
            x2="50"
            y2={major ? 17 : 15}
            stroke="currentColor"
            strokeWidth={major ? 2.4 : 1.4}
            strokeLinecap="round"
            opacity={major ? 0.85 : 0.4}
            transform={`rotate(${i * 30} 50 50)`}
          />
        );
      })}

      <line
        x1="50" y1="56" x2="50" y2="28"
        stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"
        transform={`rotate(${hourAngle} 50 50)`}
      />
      <line
        x1="50" y1="58" x2="50" y2="18"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        transform={`rotate(${minuteAngle} 50 50)`}
      />
      {showSecond && (
        <line
          x1="50" y1="62" x2="50" y2="14"
          stroke="var(--color-primary)" strokeWidth="1.4" strokeLinecap="round"
          transform={`rotate(${secondAngle} 50 50)`}
        />
      )}

      <circle cx="50" cy="50" r="3" fill="currentColor" />
      {showSecond && <circle cx="50" cy="50" r="1.4" fill="var(--color-primary)" />}
    </svg>
  );
}
