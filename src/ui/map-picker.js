// Native radio behavior supplies arrow-key navigation and one tab stop per group.
export function createMapPicker(root, choices, onChange) {
  const document = root.ownerDocument;
  let value = choices[0]?.id;
  const inputs = choices.map(choice => {
    const label = document.createElement('label'); label.className = 'map-chip';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = root.id; input.value = choice.id;
    const text = document.createElement('span'); text.textContent = choice.label;
    label.append(input, text); root.append(label);
    input.addEventListener('change', () => {
      if (input.disabled) { setValue(value); return; }
      if (!input.checked || input.value === value) return;
      const previous = value;
      setValue(input.value);
      if (onChange(input.value) === false) setValue(previous);
    });
    return input;
  });
  function setValue(next) {
    if (!inputs.some(input => input.value === next)) return false;
    value = next;
    for (const input of inputs) input.checked = input.value === value;
    return true;
  }
  setValue(value);
  return {
    setValue,
    setDisabled(disabled) { for (const input of inputs) input.disabled = disabled; },
  };
}
