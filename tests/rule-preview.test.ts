import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { collectCandidates, createCleaner } from "../lib/dom";
import { createRulePreview } from "../lib/rule-preview";

test("hover reveals only the selected hidden block without scrolling or changing saved rules", () => {
  const dom = new JSDOM(
    '<main><div class="shell"><div class="advert" id="first">First ad</div><div class="advert" id="second">Second ad</div></div><p>News</p></main>',
  );
  const d = dom.window.document;
  let scrolls = 0;
  dom.window.Element.prototype.scrollIntoView = () => {
    scrolls++;
  };
  const rules = [{ selector: "div.advert", category: "ad" as const, enabled: true }];
  const cleaner = createCleaner(d);
  cleaner.apply(rules);
  const preview = createRulePreview(d, cleaner);
  assert.deepEqual(preview.show("div.advert"), { count: 2, index: 1 });
  assert.equal((d.querySelector("#first") as HTMLElement).style.display, "");
  assert.equal((d.querySelector("#second") as HTMLElement).style.display, "none");
  assert.equal((d.querySelector(".shell") as HTMLElement).style.display, "");
  assert.equal(scrolls, 0);
  cleaner.apply(rules); // A page-mutation cleaning pass must not erase the preview.
  assert.equal((d.querySelector("#first") as HTMLElement).style.display, "");
  assert.ok(!collectCandidates(d).some((c) => c.signals.includes("unclutter-ui")));
  preview.show("div.advert", true);
  assert.equal(scrolls, 1);
  assert.deepEqual(preview.show("div.advert", true), { count: 2, index: 2 });
  assert.equal((d.querySelector("#first") as HTMLElement).style.display, "none");
  assert.equal((d.querySelector("#second") as HTMLElement).style.display, "");
  preview.clear();
  assert.equal((d.querySelector("#second") as HTMLElement).style.display, "none");
  assert.equal(d.querySelector("[data-unclutter-ui]"), null);
  assert.deepEqual(rules, [{ selector: "div.advert", category: "ad", enabled: true }]);
  preview.dispose();
  cleaner.restore();
  dom.window.close();
});

test("missing, removed or protected preview targets clear safely and dispose restores hidden styles", () => {
  const dom = new JSDOM(
    '<main><h1>Protected news</h1><div id="advert" style="display:block!important">Advertisement</div></main>',
  );
  const d = dom.window.document;
  const cleaner = createCleaner(d);
  cleaner.apply([{ selector: "div#advert", category: "ad", enabled: true }]);
  const preview = createRulePreview(d, cleaner);
  preview.show("div#advert");
  assert.equal((d.querySelector("#advert") as HTMLElement).style.display, "block");
  preview.dispose();
  assert.equal((d.querySelector("#advert") as HTMLElement).style.display, "none");
  assert.deepEqual(preview.show("main"), { count: 0, index: 0 });
  preview.show("div#advert");
  d.querySelector("#advert")!.remove();
  preview.update();
  assert.equal(d.querySelector("[data-unclutter-ui]"), null);
  preview.dispose();
  cleaner.restore();
  dom.window.close();
});
