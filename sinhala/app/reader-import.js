const SINHALA_RE = /[\u0D80-\u0DFF]/;
const TOP_LEVEL_BULLET_RE = /^[-*]\s+(.+?)\s*$/;
const CHILD_BULLET_RE = /^\s+[-*]\s+(.+?)\s*$/;

export function readerImportId(name) {
  return `reader-${String(name ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")}`;
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = String(value ?? "").trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSinhala(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function splitMeanings(value) {
  return unique(String(value ?? "").split("|").map((part) => part.trim()));
}

function childLines(lines, start) {
  const children = [];
  let index = start + 1;
  for (; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    const match = lines[index].match(CHILD_BULLET_RE);
    if (!match) break;
    children.push(match[1].trim());
  }
  return { children, endIndex: index - 1 };
}

function speakerLabel(raw, speakers, uniqueSpeakers) {
  if (speakers && typeof speakers === "object" && speakers[raw]) return String(speakers[raw]);
  if (uniqueSpeakers.size <= 1) return "Speaker";
  return String(raw ?? "Speaker").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function vocabularyEntry(value) {
  if (!value || typeof value !== "object") return null;
  const si = normalizeSinhala(value.word ?? value.phrase ?? value.sinhala);
  const meanings = Array.isArray(value.meanings)
    ? unique(value.meanings.map((meaning) => String(meaning).trim()))
    : splitMeanings(value.meaning ?? value.english ?? value.translation);
  return si && meanings.length ? { si, meanings } : null;
}

function finalizeDocument({ name, sourceName, passages }) {
  if (!passages.length) throw new Error("No translated Sinhala lines were found in this file.");
  const vocabularyBySinhala = new Map();
  for (const passage of passages) {
    for (const item of passage.vocabulary) {
      const key = item.si.toLocaleLowerCase();
      const current = vocabularyBySinhala.get(key);
      vocabularyBySinhala.set(key, { si: item.si, meanings: unique([...(current?.meanings ?? []), ...item.meanings]) });
    }
  }
  return {
    id: readerImportId(name),
    title: name,
    sourceName,
    passages,
    vocabulary: [...vocabularyBySinhala.values()]
  };
}

function parseTranscriptJson(text, { name, sourceName }) {
  let source;
  try {
    source = JSON.parse(text);
  } catch {
    throw new Error("This JSON file could not be read.");
  }
  const segments = Array.isArray(source) ? source : source?.segments ?? source?.data;
  if (!Array.isArray(segments)) throw new Error("Transcript JSON needs a segments array.");
  const speakers = Array.isArray(source) ? {} : source?.speakers ?? {};
  const uniqueSpeakers = new Set(segments.map((segment) => segment?.speaker_id ?? segment?.speaker ?? "speaker_1"));
  const passages = segments.flatMap((segment, index) => {
    if (!segment || typeof segment !== "object") return [];
    const si = normalizeSinhala(segment.sinhala ?? segment.text ?? segment.transcript);
    if (!si) return [];
    const en = String(segment.english ?? segment.translation ?? "").trim();
    if (!en) throw new Error(`Line ${index + 1} is missing its English segment translation.`);
    const rawSpeaker = segment.speaker_id ?? segment.speaker ?? "speaker_1";
    const vocabulary = (segment.vocabulary ?? segment.words ?? segment.phrases ?? []).map(vocabularyEntry).filter(Boolean);
    return [{ id: `line-${index + 1}`, speaker: speakerLabel(rawSpeaker, speakers, uniqueSpeakers), si, en, vocabulary }];
  });
  return finalizeDocument({ name, sourceName, passages });
}

function parseTranscriptMarkdown(text, { name, sourceName }) {
  const passages = [];
  let speaker = "Speaker";
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].trim().match(/^\*\*([^*]+?)\*\*:?[\s]*$/);
    if (heading) {
      speaker = heading[1].trim().replace(/:$/, "") || "Speaker";
      continue;
    }
    const parent = lines[index].match(TOP_LEVEL_BULLET_RE)?.[1]?.trim();
    if (!parent || !SINHALA_RE.test(parent)) continue;
    const { children, endIndex } = childLines(lines, index);
    index = endIndex;
    const vocabulary = [];
    const otherChildren = [];
    for (const child of children) {
      const definition = child.match(/^(.+?)\s*=\s*(.+?)\s*$/);
      if (definition && SINHALA_RE.test(definition[1])) {
        const si = normalizeSinhala(definition[1]);
        const meanings = splitMeanings(definition[2]);
        if (si && meanings.length) vocabulary.push({ si, meanings });
      } else if (/[A-Za-z]/.test(child)) {
        otherChildren.push(child);
      }
    }
    const en = otherChildren.at(-1)?.trim() ?? "";
    if (!en) throw new Error(`The Sinhala line beginning “${parent.slice(0, 36)}” is missing its English translation.`);
    passages.push({ id: `line-${passages.length + 1}`, speaker, si: normalizeSinhala(parent), en, vocabulary });
  }
  return finalizeDocument({ name, sourceName, passages });
}

export function parseReaderImport(text, { fileName, name }) {
  const sourceName = String(fileName ?? "Imported transcript").trim();
  const title = String(name ?? sourceName.replace(/\.(json|md)$/i, "")).trim();
  if (!title) throw new Error("Give this reader import a name.");
  if (!String(text ?? "").trim()) throw new Error("The selected reader file is empty.");
  if (/\.json$/i.test(sourceName)) return parseTranscriptJson(text, { name: title, sourceName });
  if (/\.md$/i.test(sourceName)) return parseTranscriptMarkdown(text, { name: title, sourceName });
  throw new Error("Choose a transcript.json or translated transcript Markdown (.md) file.");
}

export function readerTokens(value) {
  return normalizeSinhala(value)
    .split(/\s+/)
    .map((token) => token.replace(/[.,!?;:()[\]'"“”‘’…]/g, "").trim())
    .filter(Boolean);
}
