export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Some embedded browsers expose the API but deny clipboard access.
    }
  }

  if (typeof document.execCommand !== "function") return false;

  const activeElement = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;";
  document.body.append(field);

  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, field.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    activeElement?.focus?.({ preventScroll: true });
  }
}
