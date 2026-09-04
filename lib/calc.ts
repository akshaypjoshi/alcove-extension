/**
 * A hand-written expression parser, because `eval` is not an option: MV3
 * blocks it outright under the extension CSP, and `new Function` with it.
 * Recursive descent over a tiny grammar is a few dozen lines and can't
 * reach anything but numbers.
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := ('-' | '+')? power
 *   power   := atom ('^' unary)?          // right-associative
 *   atom    := number | ident '(' expr ')' | ident | '(' expr ')'
 */

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (n: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

type Token = { kind: "num"; value: number } | { kind: "ident"; value: string } | { kind: "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Thousands separators are common in pasted numbers; drop them.
    if (ch === ",") {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9._]/.test(input[j])) j++;
      // Scientific notation: 1.5e-3
      if (/[eE]/.test(input[j] ?? "") && /[0-9+-]/.test(input[j + 1] ?? "")) {
        j += 2;
        while (j < input.length && /[0-9]/.test(input[j])) j++;
      }
      const raw = input.slice(i, j).replace(/_/g, "");
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Bad number "${raw}"`);
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9]/.test(input[j])) j++;
      tokens.push({ kind: "ident", value: input.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }

    if ("+-*/%^()".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }

    // Typed by anyone who copied a spreadsheet formula.
    if (ch === "×") { tokens.push({ kind: "op", value: "*" }); i++; continue; }
    if (ch === "÷") { tokens.push({ kind: "op", value: "/" }); i++; continue; }

    throw new Error(`Unexpected "${ch}"`);
  }

  return tokens;
}

export function evaluate(input: string): number {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (value: string) => {
    const t = peek();
    if (t?.kind === "op" && t.value === value) {
      pos++;
      return true;
    }
    return false;
  };

  function expr(): number {
    let left = term();
    for (;;) {
      if (eat("+")) left += term();
      else if (eat("-")) left -= term();
      else return left;
    }
  }

  function term(): number {
    let left = unary();
    for (;;) {
      if (eat("*")) left *= unary();
      else if (eat("/")) {
        const right = unary();
        if (right === 0) throw new Error("Division by zero");
        left /= right;
      } else if (eat("%")) {
        left %= unary();
      } else return left;
    }
  }

  function unary(): number {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return power();
  }

  function power(): number {
    const base = atom();
    // Right-associative: 2^3^2 is 512, not 64.
    if (eat("^")) return Math.pow(base, unary());
    return base;
  }

  function atom(): number {
    const t = peek();
    if (!t) throw new Error("Unexpected end of expression");

    if (t.kind === "num") {
      pos++;
      // Implicit multiplication: "2pi", "3(4+1)".
      const next = peek();
      if (next && (next.kind === "ident" || (next.kind === "op" && next.value === "("))) {
        return t.value * atom();
      }
      return t.value;
    }

    if (t.kind === "ident") {
      pos++;
      const fn = FUNCTIONS[t.value];
      if (fn) {
        if (!eat("(")) throw new Error(`${t.value}() needs parentheses`);
        const arg = expr();
        if (!eat(")")) throw new Error("Missing )");
        return fn(arg);
      }
      const constant = CONSTANTS[t.value];
      if (constant === undefined) throw new Error(`Unknown name "${t.value}"`);
      return constant;
    }

    if (t.value === "(") {
      pos++;
      const value = expr();
      if (!eat(")")) throw new Error("Missing )");
      return value;
    }

    throw new Error(`Unexpected "${t.value}"`);
  }

  const result = expr();
  if (pos < tokens.length) throw new Error("Trailing input");
  if (!Number.isFinite(result)) throw new Error("Not a finite number");
  return result;
}

/** Trim float noise (0.30000000000000004) without nuking real precision. */
export function formatResult(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString();
  const fixed = Number(n.toPrecision(12));
  return Math.abs(fixed) >= 1e15 || (Math.abs(fixed) < 1e-6 && fixed !== 0)
    ? fixed.toExponential(6)
    : fixed.toLocaleString(undefined, { maximumFractionDigits: 10 });
}
