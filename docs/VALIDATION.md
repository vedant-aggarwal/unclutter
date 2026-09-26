# Validation: ad-container discovery

Date: 2026-09-27. Baseline: kitze/unclutter commit `9ef9beccc1e57b4e3115ae68644b8fc9c19c29f6` (0.3.0).

## Live AajTak homepage test

Used the existing Chrome session and the real rendered `https://www.aajtak.in/` DOM. Executed the original source collector, original Jev request builder, real Vercel AI Gateway request, original answer validation, and original cleaner. Repeated with this fork's collector/request/cleaner. The API key stayed outside the page and repository. No mocked model answers were used in these live runs.

| Check                      | Original | Fork     |
| -------------------------- | -------- | -------- |
| Jev Gateway request        | HTTP 200 | HTTP 200 |
| Sidebar MTF wrapper        | 271 px   | 0 px     |
| Middle sidebar wrapper     | 271 px   | 0 px     |
| Sidebar BTF wrapper        | 271 px   | 0 px     |
| Editorial interview banner | Visible  | Visible  |
| Live TV frame              | Visible  | Visible  |

The original collector omitted `div.add-center-div`/`#MTF`/`#BTF`. Its stable-ID filter also rejected long numeric GPT IDs. The fork found the actual slots and their dedicated shells, passed structural evidence to Jev, then applied guarded rules to the entire advertising containers. Script contents no longer inflate useful-text protection checks.

The browser session already suppressed some ad creatives. These results establish cleanup of **empty ad containers and reserved space**, not interception of ad requests or a loaded-creative benchmark. Lazy loading changed candidate/news-link counts during testing; they are not used as an accuracy score. Same-heading before/after screenshots were captured separately after browser repaint. No screenshots or full page dumps are required to run the synthetic suite.

## Regression coverage

### Late paid cards after a single analysis

A second Chrome test reproduced the reported re-analysis problem with loaded Taboola creatives. The first snapshot at the top of the homepage had 41 candidates and zero paid Taboola cards. One real Jev Gateway call succeeded (HTTP 200, about 1.24 s). Its answers produced 23 rules including the local live-ad rule. The production cleaner and mutation-watcher modules were then exercised on the live page while scrolling to the feed.

After lazy loading, all 23 observed paid cards were hidden and all 7 observed organic news cards remained visible. Live TV and the editorial interview banner stayed visible. No second model request was made. The local detector requires Taboola's paid-item marker and sponsored disclosure, not just advertising words. Empty native-feed roots remain visible so their content can load. Constant mutations are throttled instead of indefinitely postponing cleanup.

This was a source-module browser harness test, not a claim that every installed-browser UI flow or every ad vendor was verified. The 32 automated tests also cover delayed insertion, new slot types, more than 20 paid cards, recycled cards, keep-visible overrides, pause/restore, opt-out persistence and empty-feed protection.

- AajTak-shaped 271 px sidebar shell with long inline ad bootstrap scripts.
- Numeric Google Publisher Tag IDs and late slot IDs.
- AdSense `ins` elements, explicit ad-unit attributes, advertising network iframe hosts.
- Ordinary video frames, news mentioning ads and mixed recommendation feeds stay eligible to remain visible.
- Mixed news/ad columns are not targeted as whole advertising containers.
- New editorial siblings restore a previously hidden pure shell.
- Explicit keep-visible rules override overlapping parent/broad rules.
- Selector grammar rejects arbitrary broad selectors; hostname suffix checks reject lookalike hosts.
- Ad slots beyond the ordinary 6,000-node scan receive priority.
- Existing provider, consent, template reuse, privacy, restoration and confidence checks.

Run `bun run check` for the full suite. Live tests are intentionally separate from CI and require your own credentials. The source `scripts/smoke-jev.ts` sends synthetic inputs only. Reproducing a public-page model comparison costs provider credits.

## Limits still open

### Rule preview (0.4.1)

Chrome exercised the actual popup UI and production cleaner/preview modules on a local two-ad fixture, with only the extension messaging transport mocked. Hover revealed the hidden target with an outline while scrollY stayed at 450. Clicking scrolled to the first target; another click selected the second. Neither click changed the saved rule. The separate checkbox changed hide/show once and cleared the preview. Automated coverage checks collapsed ancestors, sibling isolation, mutation reapplication, missing/protected/removed targets, unchanged rule data, and restoration. All 34 tests pass. Native popup-to-content port teardown is implemented but not verified in an installed browser extension in this tool session.

Unknown ad vendors and layouts, closed shadow DOM, unsupported native-ad formats and in-video ads need separate work. The detector is conservative by design and does not promise every ad on every platform. Supported slots and Taboola paid cards are discovered locally after analysis; unsupported markup may still require re-analysis or a detector improvement. Network requests and consent decisions are unchanged.
