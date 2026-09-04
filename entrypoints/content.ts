/**
 * The launcher only. All chat UI lives in an iframe pointed at chat.html,
 * for two reasons:
 *
 *   1. Origin. A content script's fetch inherits the *host page's* origin,
 *      so calling api.anthropic.com from here is a CORS failure no header
 *      fixes. chat.html runs on the extension origin, where the manifest's
 *      host_permissions actually apply.
 *   2. Styling. Tailwind's reset in a content script would repaint whatever
 *      site you're on. An iframe is a hard boundary, for free.
 *
 * The launcher button itself lives in a shadow root so page CSS can't
 * reach it either.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",

  /**
   * Registered at runtime rather than declared in the manifest.
   *
   * A manifest-declared <all_urls> script is granted at install, shows
   * "Read and change all your data on every website" in the install
   * prompt, and reads to a store reviewer as a second purpose bolted onto
   * a new tab page. Registered at runtime, the default install is a pure
   * new-tab replacement and this asks for the host permission only when
   * someone switches the feature on. See lib/companion.ts.
   */
  registration: "runtime",

  main() {
    // Skip iframes; otherwise an ad frame gets its own launcher.
    if (window.top !== window) return;

    const host = document.createElement("div");
    host.id = "tabby-root";
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .launcher {
        position: fixed; right: 20px; bottom: 20px;
        width: 44px; height: 44px; border-radius: 999px; border: 0;
        background: #4f46e5; color: #fff; cursor: pointer;
        display: grid; place-items: center;
        box-shadow: 0 8px 28px rgba(0,0,0,.28);
        transition: transform .18s ease, opacity .18s ease;
        font-size: 18px; line-height: 1;
      }
      .launcher:hover { transform: scale(1.06); }
      .launcher[hidden] { display: none; }
      .frame {
        position: fixed; right: 20px; bottom: 20px;
        width: 400px; height: min(640px, calc(100vh - 40px));
        border: 0; border-radius: 14px; background: transparent;
        color-scheme: normal;
        box-shadow: 0 24px 64px rgba(0,0,0,.32);
        opacity: 0; transform: translateY(12px) scale(.98);
        transition: opacity .2s ease, transform .2s ease;
        pointer-events: none;
      }
      .frame.open { opacity: 1; transform: none; pointer-events: auto; }
    `;

    const button = document.createElement("button");
    button.className = "launcher";
    button.title = "Ask Alcove";
    button.textContent = "✦";

    const frame = document.createElement("iframe");
    frame.className = "frame";
    frame.src = browser.runtime.getURL("/chat.html");
    // The iframe is our own document; the sandbox attribute is deliberately
    // omitted so it keeps the extension origin (and thus its permissions).
    frame.setAttribute("allow", "clipboard-write");

    let open = false;
    const toggle = (next = !open) => {
      open = next;
      frame.classList.toggle("open", open);
      button.hidden = open;
      if (open) frame.contentWindow?.focus();
    };

    button.addEventListener("click", () => toggle());

    // Close requests come from the X inside the iframe. Only trust messages
    // whose source is that exact frame - any page can postMessage at us.
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === "tabby:close") toggle(false);
    });

    browser.runtime.onMessage.addListener((message: { type?: string }) => {
      if (message?.type === "tabby:toggle") toggle();
    });

    shadow.append(style, frame, button);
    document.documentElement.append(host);
  },
});
