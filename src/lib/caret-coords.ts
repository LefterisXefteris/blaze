const MIRROR_PROPERTIES = [
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

export function getCaretCoordinates(
  element: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const style = window.getComputedStyle(element);
  const mirror = document.createElement("div");
  document.body.appendChild(mirror);

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.width = `${element.clientWidth}px`;

  for (const prop of MIRROR_PROPERTIES) {
    mirror.style[prop] = style[prop];
  }

  const textBefore = element.value.substring(0, position);
  const textAfter = element.value.substring(position) || "\u200b";

  mirror.textContent = textBefore;
  const span = document.createElement("span");
  span.textContent = textAfter;
  mirror.appendChild(span);

  const rect = element.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const top = rect.top + (spanRect.top - mirrorRect.top) - element.scrollTop;
  const left = rect.left + (spanRect.left - mirrorRect.left) - element.scrollLeft;
  const height = spanRect.height || parseFloat(style.lineHeight) || 20;

  document.body.removeChild(mirror);

  return { top, left, height };
}
