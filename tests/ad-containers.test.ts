import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { collectCandidates, createCleaner, matchingElements } from "../lib/dom";
import { evaluationRequest, rulesFromAnswers } from "../lib/jev";
import { pageContext } from "../lib/page-context";
import { adEvidence } from "../lib/ad-evidence";

const doc = (html: string) => new JSDOM(html, { url: "https://example.com" }).window.document;
const selectAds = (d: Document) => {
  const candidates = collectCandidates(d);
  return rulesFromAnswers(
    {
      answers: Object.fromEntries(
        candidates.map((c) => [
          c.id,
          {
            type: "choice",
            choice: c.adEvidence?.length ? "ad" : "keep",
          },
        ]),
      ),
    },
    candidates,
  );
};

test("AajTak-shaped empty GPT units remove the full 271px shell, not only the label", () => {
  const d = doc(`<main><h1>News</h1><div class="column">
    <div class="add-center-div itgdAdsPlaceholder" id="MTF" style="min-height:271px">
      <div class="adtext">Advertisement</div><div class="add-section">
      <div id="div-gpt-ad-1635840167143-0" style="min-height:250px;display:none"><script>${"x".repeat(3000)}</script></div>
      </div></div><p id="news">Editorial news stays visible.</p></div></main>`);
  const candidates = collectCandidates(d);
  assert.ok(candidates.some((c) => c.selector === "div#MTF" && c.adEvidence?.length));
  const cleaner = createCleaner(d);
  cleaner.apply(selectAds(d));
  assert.equal((d.querySelector("#MTF") as HTMLElement).style.display, "none");
  assert.equal((d.querySelector(".column") as HTMLElement).style.display, "");
  assert.equal((d.querySelector("#news") as HTMLElement).style.display, "");
  cleaner.restore();
  assert.equal((d.querySelector("#MTF") as HTMLElement).style.minHeight, "271px");
});

test("numeric GPT IDs, AdSense, data attributes and network frames are discovered without ad words", () => {
  const d = doc(`<main><h1>News</h1>
    <div id="div-gpt-ad-1234567890000-0"></div>
    <ins class="adsbygoogle" data-ad-slot="23456"></ins>
    <section data-ad-unit="rail"></section>
    <div class="railbox"><iframe src="https://tpc.googlesyndication.com/creative?private=123"></iframe></div>
    <iframe id="video-player" src="https://www.youtube.com/embed/abc" title="News video"></iframe>
    </main>`);
  const candidates = collectCandidates(d);
  assert.ok(candidates.some((c) => c.selector === 'div[id^="div-gpt-ad-"]'));
  assert.ok(candidates.some((c) => c.selector === "ins.adsbygoogle"));
  assert.ok(candidates.some((c) => c.selector === "section[data-ad-unit]"));
  assert.ok(candidates.some((c) => c.selector === "div.railbox" && c.adEvidence?.length));
  assert.equal(adEvidence(d.querySelector("#video-player")!).length, 0);
  const request = evaluationRequest({ context: pageContext(d, d.URL), url: d.URL, candidates });
  assert.ok(!JSON.stringify(request).includes("private=123"));
  assert.match(JSON.stringify(request), /Advertising iframe network/);
  const cleaner = createCleaner(d);
  cleaner.apply(selectAds(d));
  assert.equal((d.querySelector("#video-player") as HTMLElement).style.display, "");
});

test("mixed news/ad columns never become whole-column targets; saved shells are revalidated", () => {
  const d = doc(`<main><div class="rail"><h2>Latest headlines</h2>
    <div id="div-gpt-ad-1234567890000-0"></div><a href="/story">News about advertising</a></div>
    <div class="shell"><span>विज्ञापन</span><div data-ad-slot="rail"></div></div></main>`);
  assert.equal(adEvidence(d.querySelector(".rail")!).length, 0);
  const cleaner = createCleaner(d);
  const rules = selectAds(d);
  cleaner.apply(rules);
  assert.equal((d.querySelector(".rail") as HTMLElement).style.display, "");
  assert.equal((d.querySelector(".shell") as HTMLElement).style.display, "none");
  d.querySelector(".shell")!.insertAdjacentHTML(
    "beforeend",
    '<a href="/story2">New editorial story</a>',
  );
  cleaner.apply(rules);
  assert.equal((d.querySelector(".shell") as HTMLElement).style.display, "");
});

test("late ad slots reuse constrained selectors; unsafe selectors and fake network suffixes fail", () => {
  const d = doc('<main><div id="div-gpt-ad-1234567890000-0"></div></main>');
  const rules = selectAds(d);
  const cleaner = createCleaner(d);
  cleaner.apply(rules);
  d.querySelector("main")!.insertAdjacentHTML(
    "beforeend",
    '<div id="div-gpt-ad-9999999999999-1"></div>',
  );
  cleaner.apply(rules);
  assert.equal(
    (d.getElementById("div-gpt-ad-9999999999999-1") as HTMLElement).style.display,
    "none",
  );
  assert.deepEqual(matchingElements(d, 'div[id^="div-"]'), []);
  assert.deepEqual(matchingElements(d, "div[data-secret]"), []);
  const frame = d.createElement("iframe");
  frame.src = "https://doubleclick.net.evil.example/";
  assert.deepEqual(adEvidence(frame), []);
});

test("ads beyond the general scan/candidate limits have priority over low-signal clutter", () => {
  const d = doc(
    "<main>" + "<div></div>".repeat(6100) + '<div id="div-gpt-ad-1234567890000-0"></div></main>',
  );
  assert.ok(collectCandidates(d).some((c) => c.adEvidence?.length));
});

test("news mentioning advertising and mixed native recommendation feeds have no structural ad verdict", () => {
  const d = doc(
    '<div class="banner"><h2>How online ads work</h2><p>Advertisement revenue supports journalism.</p></div><div id="taboola-feed"><a href="/story">Useful story</a><span>Sponsored</span></div>',
  );
  assert.deepEqual(adEvidence(d.querySelector(".banner")!), []);
  assert.deepEqual(adEvidence(d.querySelector("#taboola-feed")!), []);
});

test("keep-visible wins over overlapping broad ad selectors and wrapper collapse", () => {
  const d = doc(
    '<main><div class="shell"><div id="div-gpt-ad-1234567890000-0"></div><div id="div-gpt-ad-1234567890000-1"></div></div></main>',
  );
  const cleaner = createCleaner(d);
  cleaner.apply([
    { selector: 'div[id^="div-gpt-ad-"]', category: "ad", enabled: true, guard: "ad-container" },
    { selector: "div.shell", category: "ad", enabled: true, guard: "ad-container" },
    { selector: 'div[id="div-gpt-ad-1234567890000-0"]', category: "ad", enabled: false },
  ]);
  assert.equal((d.querySelector(".shell") as HTMLElement).style.display, "");
  assert.equal((d.getElementById("div-gpt-ad-1234567890000-0") as HTMLElement).style.display, "");
  assert.equal(
    (d.getElementById("div-gpt-ad-1234567890000-1") as HTMLElement).style.display,
    "none",
  );
});
