const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** Makes file names and keys safe to print, so they cannot move the cursor or recolor a terminal. */
export function escapeControlCharacters(text: string): string {
  return text.replace(CONTROL_CHARACTERS, (character) => {
    const code = character.charCodeAt(0);
    if (code <= 0xff) {
      return `\\x${code.toString(16).padStart(2, '0')}`;
    }
    return `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Orders strings by UTF-16 code units so output does not depend on the system locale. */
export function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
