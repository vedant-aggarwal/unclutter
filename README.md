# Unclutter

Remove advertising containers and the empty space they leave behind, with reusable AI-reviewed rules.

This is [Vedant Aggarwal's fork](https://github.com/vedant-aggarwal/unclutter) of [Kitze's Unclutter](https://github.com/kitze/unclutter). The original extension, Jev integration and reversible template system are Kitze's work. This fork improves ad discovery and container safety. MIT licensed.

## What changed

- Finds Google Publisher Tag slots with numeric IDs, AdSense units, explicit ad-unit attributes and known advertising iframe hosts.
- Gives Jev structural evidence instead of relying on names or the word “Advertisement”.
- Targets the dedicated ad container, including an empty slot's label and reserved space.
- Revalidates ad containers when saved rules run. News added to a previously empty wrapper makes it visible again.
- Keeps explicit keep-visible choices across re-analysis and overlapping rules.
- Continues discovering verified ad slots and disclosed Taboola paid cards as they load, using local checks without additional AI requests. Regular Taboola stories stay visible.
- Preserves editorial banners, live TV, navigation, login/payment controls and mixed content.

**Verified example:** on the AajTak homepage, the original real-model run left three empty sidebar ad containers at 271 px each. This fork's real-model run reduced each to 0 px while retaining the live TV and editorial interview banner. This is a test of empty advertising slots, not proof of universal ad blocking. See [validation and limits](docs/VALIDATION.md).

**Single-analysis follow-up:** a fresh top-of-page snapshot contained no Taboola paid cards. After one analysis, scrolling loaded 23 paid cards; local detection hid all 23 while keeping 7 organic news cards visible, without another AI call.

## Install in Arc, Chrome or another Chromium browser

1. Download the Chromium build attached to a GitHub release, or build from source below.
2. Extract it to a permanent folder. Do not delete that folder after installation.
3. Open `chrome://extensions` (`arc://extensions` in Arc), enable Developer mode, and choose **Load unpacked**.
4. Select the extracted folder containing `manifest.json`.
5. Pin Unclutter and refresh the website you want to clean.
6. Open the extension, select **Vercel AI Gateway** or **TypeSafe AI**, paste your own matching API key, then save.
7. Keep **Manual** selected and click **Analyze page**. Existing templates use **Re-analyze**.

No API key is bundled. You need provider credits and Jev access. Manual analysis incurs API charges; saved rules apply locally without another model request. **On page visit** is optional and makes paid requests for new templates. It is off by default.

To upgrade an existing unpacked install, replace the files in the same folder, click **Reload** on its extension card, and refresh website tabs. Keys/settings remain in browser storage. Existing enabled templates gain local ad discovery automatically; no repeat analysis is needed for newly supported structural ads. Paused templates and keep-visible choices remain respected. The **Keep removing ads as they load** rule controls ongoing detection.

## Build from source

Requires Node.js 22.12+ and Bun 1.4.2+ (the lockfile uses Bun's v2 format).

```sh
git clone https://github.com/vedant-aggarwal/unclutter.git
cd unclutter
bun install --frozen-lockfile
bun run check
bun run build
```

Load `.output/chrome-mv3`. `bun run zip` creates the Chromium ZIP. No background development server is needed.

Firefox: `bun run build:firefox`, then load `.output/firefox-mv2/manifest.json` through `about:debugging`. This is a temporary install; permanent Firefox distribution needs Mozilla signing. Safari packaging is not included.

## How it works

1. **Discover** a bounded set of local candidates. Advertising slots get priority even when they appear late in a large document.
2. **Describe** their structural signals and short redacted snippets. Provider URLs, page URLs, form values, raw HTML and keys are not added to the model state.
3. **Classify** each candidate with Jev's typed choices. No model-generated selectors, CSS or executable code.
4. **Validate and hide** matching elements with reversible styles. Supplied choice probabilities/confidence must meet the existing 0.9 threshold; uncertain results stay visible.
5. **Keep watching** locally. A bounded mutation pass discovers new supported ad slots and paid cards even if they did not exist during analysis. Constant page updates cannot indefinitely postpone cleanup. No extra model calls are made. Pause, disable, or uncheck a rule to restore content.

Core files: `lib/ad-evidence.ts`, `lib/dom.ts`, `lib/jev.ts`, `entrypoints/cleaner.content.ts`, `entrypoints/background.ts`.

## Privacy and limits

- The key is stored locally in extension storage, not encrypted or synced. It is used only by the extension background to call the selected fixed provider endpoint. Never put it in source files or share an exported browser profile.
- Each analysis sends at most 60 bounded candidate descriptions. Main article text and form values are excluded; email-like and long numeric snippets are redacted. Snippets can still contain personal information, so use judgment on sensitive pages.
- This is visual cleanup. It does not block ad network traffic, prevent tracking, reject cookies, bypass paywalls, or stop ads inside a video player.
- Ordinary iframes and the word “ad” are not enough evidence. Unknown vendors, shadow DOM, unsupported native-ad formats and newly introduced layouts may remain visible. Cross-origin iframe contents are not inspected.
- Cookie overlays can be hidden without clicking Accept/Reject or recording consent. Pause to access those controls.
- Analysis can fail because of provider access, rate limits or ambiguous markup. Failures preserve existing rules and do not automatically retry paid calls.

## Contributing

Run `bun run check`, `bun run build`, and `bun run build:firefox`. Add a small synthetic regression fixture for a missed container and a nearby useful-content counterexample. Do not submit API keys, browsing histories, raw authenticated pages or private data. Describe the website/layout, expected behaviour, and whether the slot had a loaded creative or was empty.

Original author: [Kitze](https://kitze.io). Fork improvements: [Vedant Aggarwal](https://github.com/vedant-aggarwal). [MIT license](LICENSE).
