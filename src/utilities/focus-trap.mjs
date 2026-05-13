const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea",
  "input:not([type='hidden'])",
  "select",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * Trap keyboard focus within `el`. Returns a cleanup function.
 * Also focuses the first focusable element immediately.
 */
export function trapFocus(el) {
  function focusable() {
    return [...el.querySelectorAll(FOCUSABLE)].filter(
      (n) => !n.closest("[hidden]") && getComputedStyle(n).display !== "none"
    );
  }

  function onKey(e) {
    if (e.key !== "Tab") return;
    const nodes = focusable();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first || !el.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last || !el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  el.addEventListener("keydown", onKey);
  const first = focusable()[0];
  if (first) first.focus();

  return () => el.removeEventListener("keydown", onKey);
}
