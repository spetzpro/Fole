import { getUiStateStore, ActivePanel } from "../../src/core/ui/UiStateStore";

function runUiStateStoreTests(): void {
  const store = getUiStateStore();

  const seen: ActivePanel[] = [];

  store.subscribe((state) => {
    seen.push(state.activePanel);
  });

  store.setActivePanel("map");
  store.setActivePanel("files");
  store.toggleSidebar();

  if (seen[0] !== "default" || seen.includes("settings") || !seen.includes("map") || !seen.includes("files")) {
    throw new Error("UiStateStore did not track activePanel changes as expected");
  }
}

runUiStateStoreTests();
