import type { Candidate, Rule } from "./model";
import { LIVE_ADS_SELECTOR } from "./model";
import { adEvidence, adSeeds, directAdEvidence, isAdContainer, isAdShell } from "./ad-evidence";

const structural = 'html,body,main,article,nav,[role="main"],[role="navigation"]';
const sensitive =
  'input[type="password"],input[type="email"],input[type="text"],input:not([type]),textarea,[contenteditable="true"]';
const protectedSelector = `${structural},header,h1,form,input,textarea,select,[contenteditable="true"],dialog`;
const clutter =
  /(?:^|[-_\s])(?:ad|ads|advert|advertisement|advertising|sponsor|sponsored|promo|promotion|banner|newsletter|subscribe|subscription|upsell|popup|modal|overlay|share|social|recommendations|related|cookie|consent)(?:$|[-_\s])/i;
// Stable vendor prefixes survive per-session numeric IDs. BBC's public ad
// bootstrap uses Sourcepoint (cdn.privacy-mgmt.com) and ngasCookiePrompt.
const consentPrefixes = ["sp_message_container_", "sp_message_iframe_"];
const stable = (value: string) =>
  value.length >= 3 &&
  value.length < 90 &&
  /^[a-zA-Z_][\w-]*$/.test(value) &&
  !/\d{4}|[a-f0-9]{8}|^(css|sc|jsx)-/i.test(value);
const identity = (el: Element) =>
  `${el.id} ${el.getAttribute("class") ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${el.getAttribute("data-testid") ?? ""} ${el.getAttribute("data-component") ?? ""}`;

function plainText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy
    .querySelectorAll("script,style,noscript,svg,input,textarea,select,[contenteditable]")
    .forEach((node) => node.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function isCookieNotice(el: Element): boolean {
  if (consentPrefixes.some((prefix) => el.id.startsWith(prefix))) return true;
  const name = identity(el);
  if (/cookie|consent|onetrust|didomi|privacy[-_ ]?(?:manager|modal|dialog)/i.test(name))
    return true;
  if (!el.matches('[role="dialog"],[aria-modal="true"]')) return false;
  const text = el.textContent ?? "";
  return (
    /cookies|consent|privacy choices/i.test(text) &&
    /accept|reject|agree|manage|preferences/i.test(text)
  );
}

export function isProtected(el: Element): boolean {
  const lazyFeed = '[id^="taboola-"]:not(.tbl-feed-card),.tbl-feed-container';
  if (el.matches(lazyFeed) || el.querySelector(lazyFeed)) return true;
  // A native feed may mix sponsored cards with real publisher stories.
  if (
    el.matches(".trc_spotlight_item:not(.syndicatedItem)") ||
    el.querySelector(".trc_spotlight_item:not(.syndicatedItem)")
  )
    return true;
  const cookie = isCookieNotice(el);
  // Cookie controls may contain headings/checkbox forms. Never weaken core
  // content, credential, payment, authentication or native-modal protections.
  const selector = cookie ? `${structural},${sensitive},dialog` : protectedSelector;
  if (el.matches(selector) || el.querySelector(selector)) return true;
  if (el.closest('[contenteditable="true"]') || (!cookie && el.closest("form"))) return true;
  if (/paywall|sign[-_ ]?in|log[-_ ]?in|captcha|checkout|payment/i.test(identity(el))) return true;
  const text = plainText(el);
  if (/sign in to continue|subscribe to (?:read|continue)|verify you are human/i.test(text))
    return true;
  if (cookie) return text.length > 20_000;
  return (
    text.length > 2000 ||
    [...el.querySelectorAll("p")].some((p) => (p.textContent?.length ?? 0) > 600)
  );
}

export function matchingElements(doc: Document, selector: string): Element[] {
  if (selector === LIVE_ADS_SELECTOR) return [...discoverAdRoots(doc)];
  const ordinary =
    /^[a-z][a-z0-9-]*(?:\[data-(?:testid|component|test|qa)="[\w-]{3,89}"\]|#[\w-]{3,89}|\.[\w-]{3,89})$/;
  const consentPrefix = /^(?:div|iframe)\[id\^="(sp_message_container_|sp_message_iframe_)"\]$/;
  const adPrefix = /^(?:div|iframe)\[id\^="(?:div-gpt-ad-|google_ads_iframe_)"\]$/;
  const adAttribute = /^(?:div|section|aside|ins)\[data-ad-(?:slot|unit|unit-path)\]$/;
  const adId = /^(?:div|iframe)\[id="div-gpt-ad-[\w-]{1,120}"\]$/;
  if (
    !ordinary.test(selector) &&
    !consentPrefix.test(selector) &&
    !adPrefix.test(selector) &&
    !adAttribute.test(selector) &&
    !adId.test(selector)
  )
    return [];
  try {
    const elements = [...doc.querySelectorAll(selector)];
    if (elements.length > 20 || elements.some(isProtected)) return [];
    return elements;
  } catch {
    return [];
  }
}

function selectorFor(el: Element, doc: Document, ad = false): string | null {
  const tag = el.tagName.toLowerCase();
  const options: string[] = [];
  const prefix = consentPrefixes.find((value) => el.id.startsWith(value));
  if (prefix && ["div", "iframe"].includes(tag)) options.push(`${tag}[id^="${prefix}"]`);
  for (const attr of ["data-testid", "data-component", "data-test", "data-qa"]) {
    const value = el.getAttribute(attr);
    if (value && stable(value)) options.push(`${tag}[${attr}="${value}"]`);
  }
  if (stable(el.id)) options.push(`${tag}#${el.id}`);
  const classes = [...el.classList]
    .filter(stable)
    .sort((a, b) => Number(clutter.test(b)) - Number(clutter.test(a)));
  options.push(...classes.map((c) => `${tag}.${c}`));
  if (ad) {
    for (const prefix of ["div-gpt-ad-", "google_ads_iframe_"])
      if (el.id.startsWith(prefix) && ["div", "iframe"].includes(tag))
        options.push(`${tag}[id^="${prefix}"]`);
    if (/^div-gpt-ad-[\w-]{1,120}$/.test(el.id)) options.push(`${tag}[id="${el.id}"]`);
    for (const attribute of ["data-ad-slot", "data-ad-unit", "data-ad-unit-path"])
      if (el.hasAttribute(attribute)) options.push(`${tag}[${attribute}]`);
  }
  return (
    options.find((selector) => {
      const matches = matchingElements(doc, selector);
      return matches.includes(el) && (!ad || matches.every(isAdContainer));
    }) ?? null
  );
}

function redact(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "[URL]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b(?:\d[ -]?){8,}\b/g, "[number]");
}

function discoverAdRoots(doc: Document): Set<Element> {
  // Discover the actual slot before looking for names. Numeric GPT IDs, empty
  // units and third-party frames often have no readable advertising text.
  const advertising = new Set<Element>();
  for (const seed of [...doc.querySelectorAll(adSeeds)].slice(0, 1200)) {
    if (!directAdEvidence(seed).length || isProtected(seed)) continue;
    let root = seed;
    for (let depth = 0; root.parentElement && depth < 5; depth++) {
      const parent = root.parentElement;
      if (!parent.matches("div,section,aside") || isProtected(parent) || !isAdShell(parent)) break;
      root = parent;
    }
    // Prefer the complete shell; retain the slot as fallback if the shell has
    // no safe reusable selector. This is independent of site/domain names.
    advertising.add(root);
    // Retain individual slots too: a keep-visible choice inside a pure ad
    // wrapper must not stop unrelated sibling slots from being removed.
    advertising.add(seed);
  }
  return advertising;
}

export function collectCandidates(doc: Document): Candidate[] {
  const advertising = new Set<Element>();
  for (const root of discoverAdRoots(doc)) {
    if (selectorFor(root, doc, true)) advertising.add(root);
    else
      for (const seed of [root, ...root.querySelectorAll(adSeeds)]) {
        if (directAdEvidence(seed).length) advertising.add(seed);
      }
  }
  // Consent UI often arrives at the very end of body, after thousands of nodes.
  const priority = [
    ...doc.querySelectorAll(
      '[role="dialog"],[aria-modal="true"],[id^="sp_message_"],[id*="cookie" i],[id*="consent" i],#onetrust-banner-sdk,#didomi-host',
    ),
  ].slice(0, 100);
  const elements = [
    ...new Set([
      ...priority,
      ...advertising,
      ...[...doc.querySelectorAll('aside,section,div,[role="dialog"],iframe')].slice(0, 6000),
    ]),
  ];
  const seen = new Set<string>();
  const output: Candidate[] = [];
  for (const el of elements) {
    if (output.length >= 60) break;
    const cookie = isCookieNotice(el);
    const signals = `${cookie ? "Cookie consent overlay. Hide visually only; do not accept or reject consent. " : ""}${identity(el).replace(/([a-z])([A-Z])/g, "$1 $2")} ${el.getAttribute("role") ?? ""}`;
    const position = doc.defaultView?.getComputedStyle(el).position ?? "static";
    if (
      !cookie &&
      !advertising.has(el) &&
      !clutter.test(signals) &&
      !el.matches('aside,[role="dialog"],iframe') &&
      !["fixed", "sticky"].includes(position)
    )
      continue;
    if (isProtected(el)) continue;
    const evidence = adEvidence(el);
    const selector = selectorFor(el, doc, evidence.length > 0);
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);
    output.push({
      id: `e${output.length}`,
      selector,
      tag: el.tagName.toLowerCase(),
      signals: redact(signals).slice(0, 300),
      text: redact(plainText(el)).slice(0, 450),
      position,
      count: matchingElements(doc, selector).length,
      ...(evidence.length ? { adEvidence: evidence } : {}),
    });
  }
  return output;
}

const emptyLabel = /^(?:advertisement|advertising|advert|ad|sponsored|sponsored content)?$/i;
function emptyAfterHiding(el: Element, hidden: Set<Element>, depth = 0): boolean {
  if (hidden.has(el) || el.matches("script,style,noscript,template")) return true;
  if (
    depth > 8 ||
    el.matches('img,video,audio,canvas,svg,iframe,button,input,select,textarea,[role="button"]')
  )
    return false;
  // A background image or generated text may be useful even with no text nodes.
  const computed = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (computed?.backgroundImage && computed.backgroundImage !== "none") return false;
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && !emptyLabel.test((node.textContent ?? "").trim())) return false;
    if (node.nodeType === 1 && !emptyAfterHiding(node as Element, hidden, depth + 1)) return false;
  }
  return true;
}

export function collapseTargets(roots: Element[], keepVisible = new Set<Element>()): Set<Element> {
  const next = new Set(roots);
  for (const root of roots) {
    let parent = root.parentElement;
    for (let depth = 0; parent && depth < 5; depth++, parent = parent.parentElement) {
      if (
        !parent.matches("div,section,aside") ||
        isProtected(parent) ||
        [...keepVisible].some((el) => parent!.contains(el)) ||
        !emptyAfterHiding(parent, next)
      )
        break;
      next.add(parent);
    }
  }
  return next;
}

type SavedStyle = { value: string; priority: string; applied: string; appliedPriority: string };
export function createCleaner(doc: Document) {
  const attribute = `data-unclutter-${crypto.randomUUID().replaceAll("-", "")}`;
  const style = doc.createElement("style");
  style.textContent = `[${attribute}] { display: none !important; min-height: 0 !important; height: 0 !important; margin: 0 !important; padding: 0 !important; }`;
  const marked = new Set<Element>();
  const overrides = new Map<HTMLElement, Map<string, SavedStyle>>();
  const release = (el: HTMLElement, property: string) => {
    const saved = overrides.get(el)?.get(property);
    if (!saved) return;
    if (
      el.style.getPropertyValue(property) === saved.applied &&
      el.style.getPropertyPriority(property) === saved.appliedPriority
    ) {
      if (saved.value) el.style.setProperty(property, saved.value, saved.priority);
      else el.style.removeProperty(property);
    }
    overrides.get(el)?.delete(property);
    if (!overrides.get(el)?.size) overrides.delete(el);
  };
  const override = (el: HTMLElement, property: string, value: string) => {
    const props = overrides.get(el) ?? new Map<string, SavedStyle>();
    const previous = props.get(property);
    if (
      !previous ||
      el.style.getPropertyValue(property) !== previous.applied ||
      el.style.getPropertyPriority(property) !== previous.appliedPriority
    ) {
      const original = {
        value: el.style.getPropertyValue(property),
        priority: el.style.getPropertyPriority(property),
      };
      el.style.setProperty(property, value, "important");
      props.set(property, {
        ...original,
        applied: value,
        appliedPriority: el.style.getPropertyPriority(property),
      });
      overrides.set(el, props);
    }
  };
  const restore = () => {
    for (const el of marked) el.removeAttribute(attribute);
    marked.clear();
    for (const [el, props] of overrides) for (const property of props.keys()) release(el, property);
    style.remove();
  };
  const apply = (rules: Rule[]) => {
    const keepVisible = new Set(
      rules.filter((r) => !r.enabled).flatMap((r) => matchingElements(doc, r.selector)),
    );
    const roots = [
      ...new Set(
        rules
          .filter((r) => r.enabled)
          .flatMap((r) =>
            matchingElements(doc, r.selector).filter(
              (el) =>
                (r.guard !== "ad-container" || isAdContainer(el)) &&
                ![...keepVisible].some((kept) => el.contains(kept) || kept.contains(el)),
            ),
          ),
      ),
    ];
    const next = collapseTargets(roots, keepVisible);
    const contains = (el: Element) =>
      [...next].some((hidden) => hidden === el || hidden.contains(el));
    const overlay = roots.some(
      (el) => isCookieNotice(el) || doc.defaultView?.getComputedStyle(el).position === "fixed",
    );
    // Never unlock behind an unrelated visible modal (e.g. login or payment).
    const otherModal = [
      ...doc.querySelectorAll('dialog[open],[aria-modal="true"],[role="dialog"]'),
    ].some(
      (el) =>
        !contains(el) &&
        doc.defaultView?.getComputedStyle(el).display !== "none" &&
        !el.hasAttribute("hidden"),
    );
    for (const el of marked)
      if (!next.has(el)) {
        el.removeAttribute(attribute);
        if ("style" in el) release(el as HTMLElement, "display");
        marked.delete(el);
      }
    for (const el of next) {
      if (!marked.has(el)) {
        el.setAttribute(attribute, "");
        marked.add(el);
      }
      // Inline !important beats stylesheet rules; preserve and override display.
      if ("style" in el) override(el as HTMLElement, "display", "none");
    }
    for (const el of [doc.documentElement, doc.body]) {
      if (!el) continue;
      if (overlay && !otherModal) {
        const computed = doc.defaultView?.getComputedStyle(el);
        for (const property of ["overflow-x", "overflow-y"]) {
          if (
            /hidden|clip/.test(computed?.getPropertyValue(property) ?? "") ||
            overrides.get(el)?.has(property)
          )
            override(el, property, "auto");
        }
      } else {
        release(el, "overflow-x");
        release(el, "overflow-y");
      }
    }
    if (marked.size && !style.isConnected) (doc.head ?? doc.documentElement).append(style);
    if (!marked.size) style.remove();
    // Count outermost hidden blocks, not nested wrappers and their children.
    return [...next].filter(
      (el) => ![...next].some((parent) => parent !== el && parent.contains(el)),
    ).length;
  };
  return { restore, apply };
}
