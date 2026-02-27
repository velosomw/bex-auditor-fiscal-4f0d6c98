export function initSecurityProtections() {
  // Block right-click context menu
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Block keyboard shortcuts for viewing source / devtools
  document.addEventListener("keydown", (e) => {
    // F12
    if (e.key === "F12") {
      e.preventDefault();
      return;
    }
    // Ctrl+U (view source)
    if (e.ctrlKey && e.key === "u") {
      e.preventDefault();
      return;
    }
    // Ctrl+S (save page)
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+I/J/C (devtools)
    if (e.ctrlKey && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key)) {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+U (view source in some browsers)
    if (e.ctrlKey && e.shiftKey && (e.key === "U" || e.key === "u")) {
      e.preventDefault();
      return;
    }
  });

  // Disable drag on images
  document.addEventListener("dragstart", (e) => {
    if (e.target instanceof HTMLImageElement) {
      e.preventDefault();
    }
  });

  // Disable text selection via copy event on protected areas
  document.addEventListener("copy", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".no-copy")) {
      e.preventDefault();
    }
  });
}
