import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * The stock shadcn wrapper pulls the theme from next-themes. There is no
 * Next.js here - lib/theme.ts toggles `.dark` on <html>, so read that.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
