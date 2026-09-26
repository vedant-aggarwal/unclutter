import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createCleaner } from "../lib/dom";
import { LIVE_ADS_SELECTOR, withLiveAds } from "../lib/model";
import { watchPage } from "../lib/watch-page";

const paid = (i: number) =>
  `<div id="paid-${i}" class="videoCube trc_spotlight_item syndicatedItem"><a href="/offer"><img src="/creative.png">Insurance offer</a><div class="attribution-disclosure-link-sponsored">Sponsored</div></div>`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("one saved analysis catches newly mounted paid cards and new slot types automatically", async () => {
  const dom = new JSDOM(
    '<main><h1>News</h1><div id="feed" class="trc_related_container"><div id="organic" class="videoCube trc_spotlight_item"><a href="/news">News about sponsored advertising</a></div></div></main>',
  );
  const d = dom.window.document;
  const cleaner = createCleaner(d);
  const rules = withLiveAds([]); // First analysis saw no ads at all.
  cleaner.apply(rules);
  const watcher = watchPage(d, () => cleaner.apply(rules), 10);
  try {
    d.querySelector("#feed")!.insertAdjacentHTML(
      "beforeend",
      Array.from({ length: 25 }, (_, i) => paid(i)).join(""),
    );
    d.querySelector("main")!.insertAdjacentHTML(
      "beforeend",
      '<div id="new-shell"><div data-ad-slot="late"></div></div>',
    );
    await wait(100);
    for (let i = 0; i < 25; i++)
      assert.equal((d.getElementById(`paid-${i}`) as HTMLElement).style.display, "none");
    assert.equal((d.querySelector("#new-shell") as HTMLElement).style.display, "none");
    assert.equal((d.querySelector("#organic") as HTMLElement).style.display, "");
    assert.equal((d.querySelector("#feed") as HTMLElement).style.display, "");
    // A recycled card ceases to be paid: restore it on the next mutation pass.
    d.querySelector("#paid-0")!.classList.remove("syndicatedItem");
    await wait(100);
    assert.equal((d.querySelector("#paid-0") as HTMLElement).style.display, "");
    cleaner.apply([]); // Pause/global disable restores everything.
    assert.equal((d.querySelector("#paid-1") as HTMLElement).style.display, "");
  } finally {
    watcher.stop();
    cleaner.restore();
    dom.window.close();
  }
});

test("live detection respects keep-visible and its own opt-out across reanalysis/migration", () => {
  const dom = new JSDOM(
    `<main><div class="trc_related_container">${paid(0)}${paid(1)}</div></main>`,
  );
  const d = dom.window.document;
  const cleaner = createCleaner(d);
  const rules = withLiveAds([{ selector: "div#paid-0", category: "ad", enabled: false }]);
  cleaner.apply(rules);
  assert.equal((d.querySelector("#paid-0") as HTMLElement).style.display, "");
  assert.equal((d.querySelector("#paid-1") as HTMLElement).style.display, "none");
  const disabled = rules.map((r) =>
    r.selector === LIVE_ADS_SELECTOR ? { ...r, enabled: false } : r,
  );
  assert.deepEqual(withLiveAds(disabled), disabled);
  cleaner.apply(disabled);
  assert.equal((d.querySelector("#paid-1") as HTMLElement).style.display, "");
  cleaner.restore();
  dom.window.close();
});

test("continuous mutations cannot postpone the cleaner indefinitely", async () => {
  const dom = new JSDOM("<main><span>Live ticker</span></main>");
  const d = dom.window.document;
  let runs = 0;
  const watcher = watchPage(d, () => runs++, 20);
  const ticker = setInterval(() => {
    d.querySelector("span")!.textContent = String(Date.now());
  }, 5);
  try {
    await wait(140);
    assert.ok(runs >= 2, `Expected updates during ongoing mutations, got ${runs}`);
  } finally {
    clearInterval(ticker);
    watcher.stop();
    dom.window.close();
  }
});

test("an empty native feed can load before deciding which individual cards are paid", () => {
  const dom = new JSDOM(
    '<main><div class="outer"><div data-ad-slot="banner"></div><div class="itgdAdsPlaceholder"><div id="taboola-below-homepage-thumbnails"> </div></div></div></main>',
  );
  const d = dom.window.document;
  const cleaner = createCleaner(d);
  const rules = withLiveAds([
    { selector: "div.itgdAdsPlaceholder", category: "ad", enabled: true },
  ]);
  cleaner.apply(rules);
  assert.equal((d.querySelector(".outer") as HTMLElement).style.display, "");
  assert.equal((d.querySelector(".itgdAdsPlaceholder") as HTMLElement).style.display, "");
  const feed = d.querySelector("#taboola-below-homepage-thumbnails")!;
  feed.className = "trc_related_container";
  feed.innerHTML =
    paid(0) + '<div class="trc_spotlight_item" id="story"><a href="/news">Real news</a></div>';
  cleaner.apply(rules);
  assert.equal((d.querySelector("#paid-0") as HTMLElement).style.display, "none");
  assert.equal((d.querySelector("#story") as HTMLElement).style.display, "");
  cleaner.restore();
  dom.window.close();
});
