export async function copyText(text) {
  // Start the async Clipboard API request while the click still carries a
  // user gesture. Some embedded browsers reject it, so also try the legacy
  // synchronous command before that gesture expires.
  let clipboardWrite;
  try {
    const pending = navigator.clipboard?.writeText?.(text);
    clipboardWrite = pending?.then(() => true, () => false);
  } catch {
    clipboardWrite = null;
  }

  const activeElement = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;";
  document.body.append(field);

  let legacyCopied = false;
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, field.value.length);
    legacyCopied = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    legacyCopied = false;
  } finally {
    field.remove();
    activeElement?.focus?.({ preventScroll: true });
  }

  if (legacyCopied) return true;
  if (clipboardWrite) {
    return await clipboardWrite;
  }
  return false;
}
