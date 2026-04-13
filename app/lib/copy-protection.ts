export const COPY_PROTECTION_ENABLED = true;

const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

const getElementFromTarget = (target: EventTarget | null): Element | null => {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
};

export const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = getElementFromTarget(target);
  return Boolean(element?.closest(EDITABLE_SELECTOR));
};
