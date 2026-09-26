// A trailing debounce can starve forever on animated news feeds. Schedule at
// most one pending pass, without pushing it back when more ads arrive.
export function watchPage(doc: Document, update: () => void, delay = 180) {
  const view = doc.defaultView!;
  let timer: number | undefined;
  const schedule = () => {
    if (timer !== undefined) return;
    timer = view.setTimeout(() => {
      timer = undefined;
      update();
    }, delay);
  };
  const observer = new view.MutationObserver(schedule);
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "class",
      "id",
      "data-testid",
      "data-component",
      "content",
      "style",
      "src",
      "data-ad-slot",
      "data-ad-unit",
      "data-ad-unit-path",
    ],
  });
  return {
    schedule,
    stop() {
      observer.disconnect();
      view.clearTimeout(timer);
      timer = undefined;
    },
  };
}
