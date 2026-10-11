const ITEM_SELECTOR = '[role="menuitem"]';

// Open/close, outside-click and keyboard behavior for a button + menu pair.
// Bind `rootRef` to the wrapper, `triggerRef` to the button and `menuRef` to
// the menu; spread the handlers onto the trigger and the menu.
export function useDropdown() {
  const rootRef = ref<HTMLElement | null>(null);
  const triggerRef = ref<HTMLElement | null>(null);
  const menuRef = ref<HTMLElement | null>(null);
  const isOpen = ref(false);

  function items(): HTMLElement[] {
    if (!menuRef.value) {
      return [];
    }
    return Array.from(
      menuRef.value.querySelectorAll<HTMLElement>(ITEM_SELECTOR),
    );
  }

  async function focusItem(position: "first" | "last") {
    await nextTick();
    const available = items();
    const target = position === "first" ? available[0] : available.at(-1);
    target?.focus();
  }

  function open(position: "first" | "last" | null = null) {
    isOpen.value = true;
    if (position) {
      focusItem(position);
    }
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen.value) {
      return;
    }
    isOpen.value = false;
    if (restoreFocus) {
      triggerRef.value?.focus();
    }
  }

  function toggle() {
    if (isOpen.value) {
      close();
      return;
    }
    open();
  }

  function moveFocus(step: 1 | -1) {
    const available = items();
    if (!available.length) {
      return;
    }
    const current = available.indexOf(document.activeElement as HTMLElement);
    const next = (current + step + available.length) % available.length;
    available[next]?.focus();
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open("first");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      open("last");
    }
  }

  function onMenuKeydown(event: KeyboardEvent) {
    const handlers: Record<string, () => void> = {
      ArrowDown: () => moveFocus(1),
      ArrowUp: () => moveFocus(-1),
      Home: () => focusItem("first"),
      End: () => focusItem("last"),
      Escape: () => close(),
      Tab: () => close({ restoreFocus: false }),
    };
    const handler = handlers[event.key];
    if (!handler) {
      return;
    }
    if (event.key !== "Tab") {
      event.preventDefault();
    }
    handler();
  }

  function onDocumentPointerDown(event: Event) {
    if (rootRef.value?.contains(event.target as Node)) {
      return;
    }
    close({ restoreFocus: false });
  }

  onMounted(() =>
    document.addEventListener("pointerdown", onDocumentPointerDown),
  );
  onUnmounted(() =>
    document.removeEventListener("pointerdown", onDocumentPointerDown),
  );

  return {
    rootRef,
    triggerRef,
    menuRef,
    isOpen,
    open,
    close,
    toggle,
    onTriggerKeydown,
    onMenuKeydown,
  };
}
