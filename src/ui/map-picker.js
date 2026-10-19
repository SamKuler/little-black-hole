// The browser owns popover dismissal, focus return, and radio-key navigation.
export function createMapPicker(root, choices, onChange) {
  const document = root.ownerDocument;
  let value = choices[0].id;
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'map-trigger';
  const preview = document.createElement('img'); preview.alt = ''; preview.width = 48; preview.height = 36;
  const name = document.createElement('span');
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('viewBox', '0 0 24 24'); arrow.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'm9 5 7 7-7 7'); arrow.append(path);
  trigger.append(preview, name, arrow);
  const panel = document.createElement('div'); panel.id = `${root.id}-panel`; panel.className = 'map-library'; panel.setAttribute('popover', 'auto');
  trigger.setAttribute('popovertarget', panel.id); trigger.setAttribute('aria-expanded', 'false');
  const heading = document.createElement('div'); heading.className = 'map-library-heading';
  const title = document.createElement('strong'); title.id = `${root.id}-title`; title.textContent = '选择地图';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'map-library-close'; close.textContent = '完成';
  close.addEventListener('click', () => panel.hidePopover()); heading.append(title, close);
  const list = document.createElement('div'); list.className = 'map-library-list'; list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-labelledby', title.id);
  const inputs = choices.map(choice => {
    const label = document.createElement('label'); label.className = 'map-option';
    const input = document.createElement('input'); input.type = 'radio'; input.name = root.id; input.value = choice.id;
    const image = document.createElement('img'); image.src = choice.preview; image.alt = ''; image.width = 92; image.height = 64; image.loading = 'lazy';
    const text = document.createElement('span'); text.textContent = choice.label;
    label.append(input, image, text); list.append(label);
    input.addEventListener('change', () => {
      if (input.disabled) { setValue(value); return; }
      if (!input.checked || input.value === value) return;
      const previous = value; setValue(input.value);
      if (onChange(input.value) === false) setValue(previous);
      else panel.hidePopover();
    });
    return input;
  });
  panel.append(heading, list); root.append(trigger, panel);
  panel.addEventListener('beforetoggle', event => {
    trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState !== 'open') return;
    const rect = trigger.getBoundingClientRect(), window = document.defaultView;
    const width = Math.min(360, window.innerWidth - 32);
    const beside = window.innerWidth - rect.right - 32 >= width;
    const below = window.innerHeight - rect.bottom - 24, above = rect.top - 24;
    const opensBelow = below >= Math.min(360, above);
    panel.style.width = `${width}px`;
    panel.style.left = `${beside ? rect.right + 16 : Math.min(Math.max(16, rect.left), window.innerWidth - width - 16)}px`;
    panel.style.top = beside ? `${Math.max(16, Math.min(rect.top - 60, window.innerHeight - 436))}px` : opensBelow ? `${rect.bottom + 8}px` : 'auto';
    panel.style.bottom = beside || opensBelow ? 'auto' : `${window.innerHeight - rect.top + 8}px`;
    panel.style.maxHeight = `${beside ? Math.min(420, window.innerHeight - 32) : Math.min(420, opensBelow ? below : above)}px`;
  });
  panel.addEventListener('toggle', event => {
    if (event.newState === 'open') inputs.find(input => input.checked).scrollIntoView({ block: 'nearest' });
  });
  document.defaultView.addEventListener('resize', () => panel.hidePopover());
  function setValue(next) {
    const choice = choices.find(choice => choice.id === next);
    if (!choice) return false;
    value = next;
    for (const input of inputs) input.checked = input.value === value;
    name.textContent = choice.label; preview.src = choice.preview;
    trigger.setAttribute('aria-label', `选择地图，当前${choice.label}`);
    return true;
  }
  setValue(value);
  return {
    setValue,
    setDisabled(disabled) {
      trigger.disabled = disabled;
      for (const input of inputs) input.disabled = disabled;
      if (disabled) panel.hidePopover();
    },
  };
}
