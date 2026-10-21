const SINHALA_RE = /[\u0D80-\u0DFF]/;
const TIME_HEADING_RE = /^#{1,6}\s+(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\s*-?\s*$/;
const TOP_LEVEL_BULLET_RE = /^[-*]\s+(.+?)\s*$/;
const CHILD_BULLET_RE = /^\s+[-*]\s+(.+?)\s*$/;
const SOURCE_DIFFICULTIES = new Set(["starter", "intermediate", "upper", "advanced"]);
const ITEM_DIFFICULTIES = new Set(["basic", "foundation", "story", "conversation", "advanced"]);

function splitPipe(value) {
  return String(value ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueFold(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function frontmatterValue(value) {
  const trimmed = value.trim();
  if (/^(?:".*"|'.*')$/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) throw new Error("This file is missing the required story frontmatter.");
  const metadata = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const pair = rawLine.trim().match(/^([a-z][a-z0-9-]*):\s*(.*?)\s*$/i);
    if (!pair) continue;
    metadata[pair[1].toLocaleLowerCase()] = frontmatterValue(pair[2]);
  }
  return { metadata, body: markdown.slice(match[0].length) };
}

function childLines(lines, startIndex) {
  const children = [];
  let index = startIndex + 1;
  for (; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    const child = lines[index].match(CHILD_BULLET_RE)?.[1]?.trim();
    if (!child) break;
    children.push(child);
  }
  return { children, endIndex: index - 1 };
}

function tagsFromChildren(children) {
  return uniqueFold(
    children.flatMap((child) => {
      const match = child.match(/^@tags\s*=\s*(.+?)\s*$/i);
      return match ? splitPipe(match[1]) : [];
    })
  );
}

function valuesForTag(tags, prefix) {
  return uniqueFold(tags.filter((tag) => tag.startsWith(prefix)).map((tag) => tag.slice(prefix.length).trim()).filter(Boolean));
}

function validateVocabularyItem(item, validReferenceIds) {
  const kinds = valuesForTag(item.tags, "kind:");
  const difficulties = valuesForTag(item.tags, "difficulty:");
  const topics = valuesForTag(item.tags, "topic:");
  const references = valuesForTag(item.tags, "lesson:");
  const problems = [];
  if (kinds.length !== 1 || !["word", "phrase"].includes(kinds[0])) problems.push("one kind:word or kind:phrase tag");
  if (difficulties.length !== 1 || !ITEM_DIFFICULTIES.has(difficulties[0])) problems.push("one valid difficulty tag");
  if (!topics.length) problems.push("at least one topic tag");
  if (!references.length) problems.push("at least one lesson target");
  const unknown = references.filter((id) => !validReferenceIds.has(id));
  if (unknown.length) problems.push(`known lesson targets (unknown: ${unknown.join(", ")})`);
  if (problems.length) throw new Error(`Vocabulary “${item.si}” needs ${problems.join(", ")}.`);
  return {
    ...item,
    kind: kinds[0],
    level: difficulties[0],
    topics,
    grammarTags: valuesForTag(item.tags, "grammar:"),
    referenceLessonIds: references
  };
}

export function importHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function importedStoryId(fileName, title) {
  const slug = String(title ?? "story")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "story";
  return `user-story-${slug}-${importHash(String(fileName ?? title).toLocaleLowerCase())}`;
}

export function parseImportableStory(markdown, { fileName = "Imported Story.md", referenceLessonIds = [] } = {}) {
  if (typeof markdown !== "string" || !markdown.trim()) throw new Error("The selected story file is empty.");
  const { metadata, body } = parseFrontmatter(markdown.replace(/^\uFEFF/, ""));
  if (String(metadata["app-import"] ?? "").toLocaleLowerCase() !== "story") {
    throw new Error("The frontmatter must contain “app-import: story”.");
  }
  const title = String(metadata.title ?? "").trim();
  if (!title) throw new Error("The story frontmatter needs a title.");
  const difficulty = String(metadata.difficulty ?? "upper").trim().toLocaleLowerCase();
  if (!SOURCE_DIFFICULTIES.has(difficulty)) {
    throw new Error("Story difficulty must be starter, intermediate, upper, or advanced.");
  }

  const lines = body.split(/\r?\n/);
  const passages = [];
  const glossary = new Map();
  let duplicateGlossaryEntries = 0;
  let inGlossary = false;
  let time = "";
  let speaker = "Narrator";

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^#{1,6}\s+consolidated vocabulary\s*$/i.test(trimmed)) {
      inGlossary = true;
      continue;
    }
    if (!inGlossary) {
      const timeMatch = trimmed.match(TIME_HEADING_RE);
      if (timeMatch) {
        time = timeMatch[2] ? `${timeMatch[1]} - ${timeMatch[2]}` : timeMatch[1];
        continue;
      }
      const speakerMatch = trimmed.match(/^\*\*([^*]+)\*\*$/);
      if (speakerMatch) {
        speaker = speakerMatch[1].trim();
        continue;
      }
    }

    const parent = lines[index].match(TOP_LEVEL_BULLET_RE)?.[1]?.trim();
    if (!parent) continue;
    const { children, endIndex } = childLines(lines, index);
    index = endIndex;
    if (inGlossary) {
      const definition = parent.match(/^(.+?)\s*=\s*(.+?)\s*$/);
      if (!definition || !SINHALA_RE.test(definition[1])) continue;
      const si = definition[1].replace(/\s+/g, " ").trim();
      const meanings = uniqueFold(splitPipe(definition[2]));
      const tags = tagsFromChildren(children);
      if (!meanings.length) throw new Error(`Vocabulary “${si}” has no English meaning.`);
      const existing = glossary.get(si);
      if (existing) duplicateGlossaryEntries += 1;
      glossary.set(si, {
        si,
        meanings: uniqueFold([...(existing?.meanings ?? []), ...meanings]),
        tags: uniqueFold([...(existing?.tags ?? []), ...tags])
      });
      continue;
    }

    if (!SINHALA_RE.test(parent) || parent.includes("=")) continue;
    const translationChildren = children.filter((child) => !/^@tags\s*=/i.test(child) && /[A-Za-z]/.test(child));
    const en = translationChildren.at(-1)?.trim() ?? "";
    if (!en) throw new Error(`The passage beginning “${parent.slice(0, 36)}” needs a final English translation child.`);
    passages.push({
      si: parent.replace(/\s+/g, " ").trim(),
      en,
      time,
      speaker: speaker || "Narrator",
      tags: tagsFromChildren(children)
    });
  }

  if (!passages.length) throw new Error("No translated Sinhala story passages were found.");
  if (!glossary.size) throw new Error("No consolidated Sinhala vocabulary entries were found.");
  const validReferenceIds = new Set(referenceLessonIds);
  const vocabulary = [...glossary.values()].map((item) => validateVocabularyItem(item, validReferenceIds));
  const topics = splitPipe(metadata.topics);
  const tags = splitPipe(metadata["lesson-tags"]);
  const grammarTags = splitPipe(metadata["grammar-tags"]);
  const level = String(metadata.level ?? "story").toLocaleLowerCase();

  return {
    id: importedStoryId(fileName, title),
    fileName,
    title,
    difficulty,
    level: ITEM_DIFFICULTIES.has(level) ? level : "story",
    topics,
    tags,
    grammarTags,
    passages,
    vocabulary,
    duplicateGlossaryEntries
  };
}
