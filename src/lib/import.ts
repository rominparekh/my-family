// Parsers for bulk friend import from exported contact files.
// Supports vCard (.vcf) and simple CSV. Best-effort, dependency-free.

export interface ImportedContact {
  name: string;
  phone?: string;
  // Birthday components if found (month/day required, year optional).
  birthday?: { month: number; day: number; year?: number };
}

// ── vCard ──
export function parseVCard(text: string): ImportedContact[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const out: ImportedContact[] = [];

  for (const card of cards) {
    const lines = unfoldVCardLines(card);
    let fn: string | undefined;
    let nFallback: string | undefined;
    let phone: string | undefined;
    let bday: ImportedContact["birthday"];

    for (const line of lines) {
      const [rawKey, ...rest] = line.split(":");
      if (!rest.length) continue;
      const value = rest.join(":").trim();
      const key = rawKey.split(";")[0].toUpperCase();

      if (key === "FN") fn = value;
      else if (key === "N" && !nFallback) {
        // N is "Family;Given;..." — flip to "Given Family".
        const [family, given] = value.split(";");
        nFallback = [given, family].filter(Boolean).join(" ").trim();
      } else if (key === "TEL" && !phone) {
        phone = value;
      } else if (key === "BDAY") {
        bday = parseBirthday(value);
      }
    }

    const name = (fn || nFallback || "").trim();
    if (!name) continue;
    out.push({ name, phone, birthday: bday });
  }
  return out;
}

// vCard allows line folding (continuation lines start with a space/tab).
function unfoldVCardLines(card: string): string[] {
  const rawLines = card.split(/\r?\n/);
  const folded: string[] = [];
  for (const line of rawLines) {
    if (/^[ \t]/.test(line) && folded.length) {
      folded[folded.length - 1] += line.replace(/^[ \t]/, "");
    } else {
      folded.push(line);
    }
  }
  return folded.filter(Boolean);
}

// Accepts YYYY-MM-DD, YYYYMMDD, --MM-DD (no year), MM/DD/YYYY.
function parseBirthday(value: string): ImportedContact["birthday"] | undefined {
  const v = value.trim();
  let m: RegExpMatchArray | null;

  if ((m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})$/))) {
    return { year: +m[1], month: +m[2], day: +m[3] };
  }
  if ((m = v.match(/^--(\d{2})-?(\d{2})$/))) {
    return { month: +m[1], day: +m[2] };
  }
  if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    return { year: +m[3], month: +m[1], day: +m[2] };
  }
  return undefined;
}

// ── CSV ──
export function parseCsv(text: string): ImportedContact[] {
  const rows = splitCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = findCol(header, ["name", "full name", "display name", "first name"]);
  const phoneIdx = findCol(header, ["phone", "mobile", "phone number", "tel", "number"]);
  const bdayIdx = findCol(header, ["birthday", "birthdate", "dob", "date of birth"]);

  const out: ImportedContact[] = [];
  for (const row of rows.slice(1)) {
    const name = nameIdx >= 0 ? (row[nameIdx] ?? "").trim() : "";
    if (!name) continue;
    const phone = phoneIdx >= 0 ? (row[phoneIdx] ?? "").trim() || undefined : undefined;
    const birthday =
      bdayIdx >= 0 && row[bdayIdx] ? parseBirthday(row[bdayIdx].trim()) : undefined;
    out.push({ name, phone, birthday });
  }
  return out;
}

function findCol(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

// Minimal CSV parser handling quoted fields and embedded commas/newlines.
function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((c) => c.length)) rows.push(row);
  }
  return rows;
}
