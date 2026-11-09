function clearTabAnalysis(tabId) {
  chrome.storage.local.remove(`scope-analysis-${tabId}`).catch((error) => {
    console.error("Could not clear the saved analysis for a navigated tab.", error);
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    clearTabAnalysis(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabAnalysis(tabId);
});
