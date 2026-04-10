/**
 * Advanced selector helpers — convert semantic queries to CSS or XPath strings
 * that the existing selector engine can resolve.
 */

/**
 * Escapes a string value for use inside an XPath predicate.
 */
function xpathLiteral(text: string): string {
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  const parts = text.split("'").map((p) => `'${p}'`);
  return `concat(${parts.join(`, "'", `)})`;
}

/**
 * Returns an XPath selector that locates an element by its ARIA role and
 * optional accessible name (text content, aria-label, or title).
 *
 * Supports implicit roles for native HTML elements (button, link, textbox,
 * checkbox, radio, combobox, listbox, option, menuitem, heading, img).
 */
export function buildRoleSelector(role: string, options?: { name?: string }): string {
  const nativeTagMap: Record<string, string> = {
    button: 'button',
    link: 'a',
    textbox: 'input',
    checkbox: 'input',
    radio: 'input',
    combobox: 'select',
    listbox: 'select',
    option: 'option',
    img: 'img',
  };

  const name = options?.name;
  const nameCondition = name
    ? `[normalize-space(.)=${xpathLiteral(name)} or @aria-label=${xpathLiteral(name)} or @title=${xpathLiteral(name)}]`
    : '';

  const nativeTag = nativeTagMap[role];

  // Use self:: axis to match either the native element OR any element with the
  // explicit role attribute in a single XPath expression (no union needed).
  const tagCondition = nativeTag
    ? `[self::${nativeTag} or @role=${xpathLiteral(role)}]`
    : `[@role=${xpathLiteral(role)}]`;

  const xpath = `//*${tagCondition}${nameCondition}`;
  return `::-p-xpath(${xpath})`;
}

/**
 * Returns a selector that finds an <input> associated with the given <label>.
 * Handles both explicit `for`/`id` pairing and implicit (input nested inside label).
 */
export function buildLabelSelector(text: string): string {
  const escaped = xpathLiteral(text);
  // Input referenced by a label's `for` attribute, OR input nested inside a label
  return `::-p-xpath(//input[@id=//label[normalize-space(.)=${escaped}]/@for] | //label[normalize-space(.)=${escaped}]//input | //textarea[@id=//label[normalize-space(.)=${escaped}]/@for])`;
}

/**
 * Returns a CSS selector that matches elements with the given placeholder.
 */
export function buildPlaceholderSelector(text: string): string {
  // CSS attribute selector — no XPath needed
  return `[placeholder="${text.replace(/"/g, '\\"')}"]`;
}

/**
 * Returns a CSS selector that matches elements with the given data-testid.
 */
export function buildTestIdSelector(id: string): string {
  return `[data-testid="${id.replace(/"/g, '\\"')}"]`;
}

/**
 * Returns a text= selector for the existing text selector engine.
 */
export function buildTextSelector(text: string, exact = true): string {
  return exact ? `text=${text}` : `text*=${text}`;
}
