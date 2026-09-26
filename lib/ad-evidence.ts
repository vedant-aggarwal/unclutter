// Structural evidence, never a verdict based only on the word "ad".
// Do not inspect cross-origin frame content or send frame URLs to the model.
export const adSeeds =
  '[id^="div-gpt-ad-"],[id^="google_ads_iframe_"],ins.adsbygoogle,[data-ad-slot],[data-ad-unit],[data-ad-unit-path],.trc_spotlight_item.syndicatedItem,iframe';
export const adLabel =
  /^(?:advertisement|advertising|advert|ads?|sponsored(?: content)?|विज्ञापन)$/i;
const adHosts = ["doubleclick.net", "googlesyndication.com", "amazon-adsystem.com", "adnxs.com"];

function frameNetwork(el: Element): string | null {
  if (el.tagName !== "IFRAME") return null;
  try {
    const host = new URL(el.getAttribute("src") ?? "", el.ownerDocument.baseURI).hostname;
    return adHosts.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
  } catch {
    return null;
  }
}

export function directAdEvidence(el: Element): string[] {
  const evidence: string[] = [];
  // Taboola mixes paid cards and editorial recommendations in the same feed.
  // Require the vendor's paid-item marker AND disclosure; never hide the feed.
  if (
    el.matches(".trc_spotlight_item.syndicatedItem") &&
    el.closest(".trc_related_container") &&
    el.querySelector(".attribution-disclosure-link-sponsored")
  )
    evidence.push("Taboola paid recommendation with sponsored disclosure");
  if (/^div-gpt-ad-[\w-]+$/.test(el.id)) evidence.push("Google Publisher Tag ad slot");
  if (el.id.startsWith("google_ads_iframe_")) evidence.push("Google advertising frame/container");
  if (el.matches("ins.adsbygoogle")) evidence.push("AdSense unit");
  if (["data-ad-slot", "data-ad-unit", "data-ad-unit-path"].some((a) => el.hasAttribute(a)))
    evidence.push("Explicit ad-slot attribute");
  const network = frameNetwork(el);
  if (network) evidence.push(`Advertising iframe network: ${network}`);
  return evidence;
}

// A label can corroborate a slot, but must never turn a story mentioning ads
// into an advertising container. Mixed editorial/recommendation widgets stay.
export function isAdShell(el: Element, depth = 0): boolean {
  if (depth > 8) return false;
  if (el.matches("script,style,noscript,template")) return true;
  if (directAdEvidence(el).length) return true;
  if (!el.matches("div,section,aside,span,p")) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style?.backgroundImage && style.backgroundImage !== "none") return false;
  return [...el.childNodes].every((node) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").trim();
      return !text || adLabel.test(text);
    }
    return node.nodeType !== 1 || isAdShell(node as Element, depth + 1);
  });
}

export function adEvidence(el: Element): string[] {
  const direct = directAdEvidence(el);
  if (direct.length) return direct;
  if (!isAdShell(el)) return [];
  const evidence = [...new Set([...el.querySelectorAll(adSeeds)].flatMap(directAdEvidence))];
  if (!evidence.length) return [];
  return ["Dedicated ad container; no editorial siblings", ...evidence].slice(0, 6);
}

export function isAdContainer(el: Element): boolean {
  return adEvidence(el).length > 0;
}
