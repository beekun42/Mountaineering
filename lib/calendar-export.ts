/**
 * ブラウザ向け：Google カレンダー用URL・ICS（iCalendar）生成
 */

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYY-MM-DD をパースして日付のみのローカル日付として扱う */
export function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da)
    return null;
  return d;
}

export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + deltaDays);
  return formatYmd(d);
}

/**
 * Google「予定を作成」用 dates パラメータ（終日・終了日は含まない＝翌日0時）
 * 例: 4/15〜4/17 → 20260415/20260418
 */
export function toGoogleCalendarDatesParam(
  startYmd: string,
  endInclusiveYmd: string | null,
): string {
  const start = startYmd.replace(/-/g, "");
  const last =
    endInclusiveYmd &&
    endInclusiveYmd >= startYmd &&
    parseYmd(endInclusiveYmd)
      ? endInclusiveYmd
      : startYmd;
  const endExclusive = addDaysToYmd(last, 1).replace(/-/g, "");
  return `${start}/${endExclusive}`;
}

function escapeIcsText(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** 終日イベント。DTEND は「最終日の翌日」（iCalendar仕様） */
export function buildIcsAllDayEvent(opts: {
  title: string;
  description: string;
  startYmd: string;
  endInclusiveYmd: string | null;
  url?: string;
}): string {
  const last =
    opts.endInclusiveYmd &&
    opts.endInclusiveYmd >= opts.startYmd &&
    parseYmd(opts.endInclusiveYmd)
      ? opts.endInclusiveYmd
      : opts.startYmd;
  const dtStart = opts.startYmd.replace(/-/g, "");
  const dtEnd = addDaysToYmd(last, 1).replace(/-/g, "");
  const uid = `mountaineering-${dtStart}-${Math.random().toString(36).slice(2, 10)}@local`;
  const desc = [opts.description, opts.url ? `\n${opts.url}` : ""]
    .join("")
    .trim();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mountaineering Hub//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtcStamp(new Date())}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeIcsText(opts.title || "山行")}`,
    desc ? `DESCRIPTION:${escapeIcsText(desc)}` : "",
    opts.url ? `URL:${opts.url}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

function formatIcsUtcStamp(d: Date) {
  const y = d.getUTCFullYear();
  const mo = pad2(d.getUTCMonth() + 1);
  const da = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const mi = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

export function downloadIcsFile(filename: string, icsBody: string) {
  const blob = new Blob([icsBody], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function openGoogleCalendarTemplate(opts: {
  title: string;
  details: string;
  startYmd: string;
  endInclusiveYmd: string | null;
}) {
  const dates = toGoogleCalendarDatesParam(opts.startYmd, opts.endInclusiveYmd);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title || "山行",
    details: opts.details,
    dates,
  });
  window.open(
    `https://calendar.google.com/calendar/render?${params.toString()}`,
    "_blank",
    "noopener,noreferrer",
  );
}
