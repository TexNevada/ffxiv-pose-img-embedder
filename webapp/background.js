/**
 * background.js — XIV Archive Pose Image Embedder
 * Manages the extension's context menu and browser actions.
 */

const DISCORD_URL = "https://discord.gg/t66B986evg";

// Add "Join our discord - Support" to the context menu (right-click on icon)
const createContextMenu = () => {
  chrome.contextMenus.create({
    id: "join-discord",
    title: "Join our discord - Support",
    contexts: ["action"]
  }, () => {
    if (chrome.runtime.lastError) {
      // Ignore errors if the item already exists
    }
  });
};

chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

// Handle clicks on the context menu items
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "join-discord") {
    chrome.tabs.create({ url: DISCORD_URL });
  }
});

// Also open Discord if the user just clicks the extension icon (left-click)
// This makes the extension feel more responsive/functional even without a popup.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: DISCORD_URL });
});
