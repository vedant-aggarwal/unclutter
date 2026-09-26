import { browser } from "wxt/browser";
import { collectCandidates, createCleaner } from "../lib/dom";
import { pageContext } from "../lib/page-context";
import { watchPage } from "../lib/watch-page";
import { createRulePreview } from "../lib/rule-preview";
import { ANALYSIS_VERSION, unwrap, type PageState, type Profile, type Reply } from "../lib/model";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main(ctx) {
    const cleaner = createCleaner(document);
    const preview = createRulePreview(document, cleaner);
    const connectPreview = (port: ReturnType<typeof browser.runtime.connect>) => {
      if (
        port.name !== "unclutter-preview" ||
        port.sender?.id !== browser.runtime.id ||
        port.sender?.url !== browser.runtime.getURL("/popup.html")
      )
        return;
      port.onMessage.addListener(
        (message: { selector?: unknown; scroll?: unknown; clear?: unknown }) => {
          if (message.clear === true) {
            preview.clear();
            return;
          }
          if (
            typeof message.selector !== "string" ||
            !state.profile?.rules.some((r) => r.selector === message.selector)
          )
            return;
          const result = preview.show(message.selector, message.scroll === true);
          port.postMessage({ ...result, selector: message.selector });
        },
      );
      port.onDisconnect.addListener(() => preview.clear());
    };
    browser.runtime.onConnect.addListener(connectPreview);
    let state: PageState = {
      context: pageContext(document, location.href),
      profile: null,
      enabled: true,
      hiddenCount: 0,
    };
    let revision = 0;
    let lastUrl = location.href;
    let autoTimer: number | undefined;
    let autoPendingKey: string | null = null;
    const autoRequested = new Set<string>();
    let autoEnabled = false;
    const requestAuto = () => {
      if (
        !autoEnabled ||
        !state.enabled ||
        document.visibilityState !== "visible" ||
        state.profile?.enabled === false ||
        (state.profile && state.profile.analysisVersion >= ANALYSIS_VERSION)
      )
        return;
      const key = state.context.key;
      if (autoRequested.has(key) || autoPendingKey === key) return;
      clearTimeout(autoTimer);
      autoPendingKey = key;
      // Let client-rendered banners/ads mount; DOM mutation never schedules
      // additional paid calls. The background also persists attempt deduplication.
      autoTimer = ctx.setTimeout(() => {
        autoPendingKey = null;
        if (
          ctx.isInvalid ||
          !autoEnabled ||
          !state.enabled ||
          document.visibilityState !== "visible" ||
          pageContext(document, location.href).key !== key
        )
          return;
        autoRequested.add(key);
        void browser.runtime
          .sendMessage({ type: "visit", context: state.context })
          .catch(() => undefined);
      }, 1500);
    };
    const sync = async () => {
      const version = ++revision;
      const context = pageContext(document, location.href);
      if (context.key !== state.context.key || lastUrl !== location.href) {
        preview.clear();
        cleaner.restore();
        state.hiddenCount = 0;
      }
      lastUrl = location.href;
      const result = unwrap(
        (await browser.runtime.sendMessage({
          type: "sync",
          context,
          hiddenCount: state.hiddenCount,
        })) as Reply<{ profile: Profile | null; enabled: boolean; autoEnabled: boolean }>,
      );
      if (version !== revision || ctx.isInvalid) return state;
      autoEnabled = result.autoEnabled;
      state = { context, ...result, hiddenCount: 0 };
      state.hiddenCount = cleaner.apply(
        state.enabled && state.profile?.enabled ? state.profile.rules : [],
      );
      // Update badge with actual match count, not count of stored selectors.
      await browser.runtime.sendMessage({ type: "sync", context, hiddenCount: state.hiddenCount });
      requestAuto();
      return state;
    };
    const safelySync = () =>
      void sync().catch(() => {
        cleaner.restore();
      });
    const watcher = watchPage(document, () => {
      if (ctx.isInvalid) return;
      if (
        lastUrl !== location.href ||
        pageContext(document, location.href).key !== state.context.key
      ) {
        safelySync();
        return;
      }
      // DOM changes use only cached rules and local structural detection.
      // No snapshot/model request, and no storage round trip on every mutation.
      const count = cleaner.apply(
        state.enabled && state.profile?.enabled ? state.profile.rules : [],
      );
      preview.update();
      if (count !== state.hiddenCount) {
        state.hiddenCount = count;
        void browser.runtime
          .sendMessage({ type: "sync", context: state.context, hiddenCount: count })
          .catch(() => undefined);
      }
    });
    ctx.addEventListener(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") safelySync();
    });
    ctx.addEventListener(window, "wxt:locationchange", () => {
      clearTimeout(autoTimer);
      autoPendingKey = null;
      revision++;
      preview.clear();
      cleaner.restore();
      state.hiddenCount = 0;
      watcher.schedule();
    });
    const listener = (
      message: { type?: string },
      sender: { id?: string },
      sendResponse: (reply: Reply<unknown>) => void,
    ) => {
      if (sender.id !== browser.runtime.id) return;
      const respond = async () => {
        if (message.type === "refresh" || message.type === "state") return sync();
        if (message.type === "snapshot")
          return {
            context: pageContext(document, location.href),
            candidates: collectCandidates(document),
            url: location.href,
          };
        throw new Error("Unknown page request.");
      };
      void respond().then(
        (data) => sendResponse({ ok: true, data }),
        () => sendResponse({ ok: false, error: "Page connection unavailable. Refresh this tab." }),
      );
      return true;
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => {
      revision++;
      clearTimeout(autoTimer);
      watcher.stop();
      preview.dispose();
      browser.runtime.onConnect.removeListener(connectPreview);
      cleaner.restore();
      browser.runtime.onMessage.removeListener(listener);
    });
    safelySync();
  },
});
