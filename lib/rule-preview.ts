import { matchingElements, type createCleaner } from "./dom";

export function createRulePreview(doc: Document, cleaner: ReturnType<typeof createCleaner>) {
  const view = doc.defaultView!;
  const anchorStyle = doc.createElement("style");
  anchorStyle.setAttribute("data-unclutter-ui", "scroll-anchor");
  anchorStyle.textContent = "html,body{overflow-anchor:none!important}";
  const host = doc.createElement("div");
  host.setAttribute("data-unclutter-ui", "preview");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent =
    ":host{all:initial} .box{position:fixed;box-sizing:border-box;border:3px solid #168567;background:rgba(22,133,103,.12);border-radius:5px;pointer-events:none} .label{position:fixed;max-width:calc(100vw - 16px);padding:6px 9px;border-radius:5px;background:#11634e;color:white;font:600 12px/1.4 system-ui;box-shadow:0 2px 8px #0003;pointer-events:none}";
  const box = doc.createElement("div");
  box.className = "box";
  const label = doc.createElement("div");
  label.className = "label";
  shadow.append(style, box, label);
  let target: Element | null = null;
  let selector = "";
  let index = 0;
  let clicked = false;
  let count = 0;
  const update = () => {
    if (!target) return;
    if (!target.isConnected) {
      clear();
      return;
    }
    const rect = target.getBoundingClientRect();
    box.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${Math.max(rect.width, 8)}px;height:${Math.max(rect.height, 8)}px`;
    label.style.left = `${Math.max(8, Math.min(rect.left, view.innerWidth - 240))}px`;
    label.style.top = `${Math.max(8, Math.min(rect.top - 32, view.innerHeight - 40))}px`;
    label.textContent = `Preview ${index + 1}/${count} · ${rect.bottom < 0 ? "Above viewport · " : rect.top > view.innerHeight ? "Below viewport · " : ""}Click rule to locate`;
  };
  const clear = () => {
    target = null;
    selector = "";
    clicked = false;
    host.remove();
    cleaner.preview([]);
    // Settle restored layout before returning scroll anchoring to the website.
    doc.documentElement.getBoundingClientRect();
    anchorStyle.remove();
  };
  const show = (nextSelector: string, scroll = false) => {
    const all = matchingElements(doc, nextSelector);
    // A dynamic rule includes nested slots/shells. Preview each outer block once.
    const matches = all.filter((el) => !all.some((parent) => parent !== el && parent.contains(el)));
    if (!matches.length) {
      clear();
      return { count: 0, index: 0 };
    }
    const same = selector === nextSelector && target && matches.includes(target);
    index = same ? matches.indexOf(target!) : 0;
    if (same && scroll && clicked) index = (index + 1) % matches.length;
    if (!same) clicked = false;
    selector = nextSelector;
    target = matches[index]!;
    count = matches.length;
    if (!anchorStyle.isConnected) (doc.head ?? doc.documentElement).append(anchorStyle);
    cleaner.preview([target]);
    if (!host.isConnected) doc.documentElement.append(host);
    if (scroll) {
      clicked = true;
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    }
    update();
    return { count, index: index + 1 };
  };
  view.addEventListener("scroll", update, true);
  view.addEventListener("resize", update);
  return {
    show,
    clear,
    update,
    dispose() {
      clear();
      view.removeEventListener("scroll", update, true);
      view.removeEventListener("resize", update);
    },
  };
}
