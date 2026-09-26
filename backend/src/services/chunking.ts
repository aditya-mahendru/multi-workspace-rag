export interface Chunk {
  index: number;
  content: string;
  sectionLabel: string | null;
}

const CHUNK_CHARS = 1800; // roughly ~450-500 tokens
const OVERLAP_CHARS = 200;

/**
 * Splits text into overlapping chunks, trying to break on paragraph/sentence
 * boundaries first. Detects simple markdown-style headings to attach a
 * section label to each chunk for nicer citations.
 */
export function chunkText(rawText: string): Chunk[] {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  let currentSection: string | null = null;
  const labeled: { line: string; section: string | null }[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)/) ?? line.match(/^([A-Z][A-Za-z0-9 /&-]{3,60})$/);
    if (headingMatch && line.trim().length < 80) {
      currentSection = headingMatch[1].trim();
    }
    labeled.push({ line, section: currentSection });
  }

  const rebuilt = labeled.map((l) => l.line).join("\n");
  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < rebuilt.length) {
    let end = Math.min(start + CHUNK_CHARS, rebuilt.length);

    if (end < rebuilt.length) {
      const paragraphBreak = rebuilt.lastIndexOf("\n\n", end);
      const sentenceBreak = rebuilt.lastIndexOf(". ", end);
      const bestBreak = Math.max(paragraphBreak, sentenceBreak);
      if (bestBreak > start + CHUNK_CHARS * 0.5) {
        end = bestBreak + 1;
      }
    }

    const content = rebuilt.slice(start, end).trim();
    if (content.length > 0) {
      const midpointLine = labeled[Math.min(labeled.length - 1, Math.floor(((start + end) / 2 / rebuilt.length) * labeled.length))];
      chunks.push({ index, content, sectionLabel: midpointLine?.section ?? null });
      index += 1;
    }

    if (end >= rebuilt.length) break;
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }

  return chunks;
}
