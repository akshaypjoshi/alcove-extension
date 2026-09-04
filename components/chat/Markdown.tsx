import { Fragment, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * A deliberately small renderer instead of a markdown dependency: fenced
 * code, inline code, bold, italics, and links cover essentially everything
 * a chat reply uses, and the whole thing is ~60 lines with no parser to
 * keep patched. Nothing here inserts HTML - every branch returns React
 * elements, so there's no innerHTML path to sanitize.
 */

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-2">
      <pre className="bg-muted/70 overflow-x-auto rounded-lg p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        className="bg-background/80 absolute top-2 right-2 rounded-md border p-1 opacity-0 transition group-hover:opacity-100"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      </button>
      {lang && (
        <span className="text-muted-foreground absolute top-2.5 left-3 text-[10px] tracking-wide uppercase">
          {lang}
        </span>
      )}
    </div>
  );
}

/** Inline spans: `code`, **bold**, *italic*, and bare URLs. */
function inline(text: string, keyPrefix: string) {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(https?:\/\/[^\s<>()]+)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      nodes.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2"
        >
          {token}
        </a>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Markdown({ content }: { content: string }) {
  // Split on fences first; an unterminated fence (mid-stream) still gets
  // rendered as code rather than as raw backticks.
  const parts = content.split(/```/);

  return (
    <div className="text-sm leading-relaxed break-words">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          const newline = part.indexOf("\n");
          const lang = newline > 0 ? part.slice(0, newline).trim() : undefined;
          const code = newline > 0 ? part.slice(newline + 1) : part;
          return <CodeBlock key={index} code={code.replace(/\n$/, "")} lang={lang} />;
        }

        return (
          <Fragment key={index}>
            {part.split("\n").map((line, lineIndex, lines) => {
              const bullet = /^\s*([-*•]|\d+\.)\s+/.exec(line);
              return (
                <Fragment key={lineIndex}>
                  {bullet ? (
                    <span className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">
                        {bullet[1] === "*" || bullet[1] === "-" ? "•" : bullet[1]}
                      </span>
                      <span>{inline(line.slice(bullet[0].length), `${index}-${lineIndex}`)}</span>
                    </span>
                  ) : (
                    inline(line, `${index}-${lineIndex}`)
                  )}
                  {lineIndex < lines.length - 1 && <br />}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
