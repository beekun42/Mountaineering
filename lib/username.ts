/** 仲間内用：表示名と重複判定用キー（トリム・正規化・英字は小文字） */

export function parseUsername(input: string):
  | { ok: true; display: string; key: string }
  | { ok: false; reason: "empty" | "length" } {
  const display = input.trim().normalize("NFKC");
  if (!display) return { ok: false, reason: "empty" };
  if (display.length < 2 || display.length > 32) {
    return { ok: false, reason: "length" };
  }
  const key = display.toLowerCase();
  return { ok: true, display, key };
}
