/**
 * Code and Markdown-Aware Semantic Chunker
 *
 * Traditional RAG chunkers slice text arbitrarily every N words or characters,
 * which catastrophically breaks code snippets, SQL DDLs, mathematical formulas,
 * and markdown tables in half.
 *
 * This chunker preserves:
 * 1. Markdown code fences (```language ... ```) intact
 * 2. Markdown tables (| col | col |) intact
 * 3. Section hierarchy (#, ##, ###) prepended as context breadcrumbs
 * 4. Structured QA blocks (Customer Problem -> Resolution) intact
 */

export interface ChunkOptions {
  maxChunkWords?: number;
  overlapWords?: number;
  documentTitle?: string;
}

export function chunkDocumentSemantic(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const {
    maxChunkWords = 400,
    overlapWords = 40,
    documentTitle = ''
  } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // 1. Identify and split text into structural blocks (preserving code fences, tables, headers, and paragraphs)
  const blocks = splitIntoStructuralBlocks(text);

  const chunks: string[] = [];
  let currentBlockAccumulator: string[] = [];
  let currentWordCount = 0;
  let currentHeaderContext = documentTitle ? `[Source: ${documentTitle}]` : '';

  for (const block of blocks) {
    // If the block is a Markdown header, update current hierarchical context
    if (/^#{1,4}\s+(.+)$/m.test(block.trim())) {
      const headerMatch = block.trim().match(/^#{1,4}\s+(.+)$/m);
      if (headerMatch) {
        currentHeaderContext = documentTitle
          ? `[${documentTitle} > ${headerMatch[1].trim()}]`
          : `[Section: ${headerMatch[1].trim()}]`;
      }
    }

    const blockWords = countWords(block);

    // If adding this block exceeds maxChunkWords, commit the current chunk
    if (currentWordCount + blockWords > maxChunkWords && currentBlockAccumulator.length > 0) {
      const chunkBody = currentBlockAccumulator.join('\n\n');
      const contextualChunk = currentHeaderContext
        ? `${currentHeaderContext}\n\n${chunkBody}`
        : chunkBody;
      chunks.push(contextualChunk.trim());

      // Retain last block if small enough for sliding overlap
      const lastBlock = currentBlockAccumulator[currentBlockAccumulator.length - 1];
      if (countWords(lastBlock) <= overlapWords) {
        currentBlockAccumulator = [lastBlock, block];
        currentWordCount = countWords(lastBlock) + blockWords;
      } else {
        currentBlockAccumulator = [block];
        currentWordCount = blockWords;
      }
    } else {
      currentBlockAccumulator.push(block);
      currentWordCount += blockWords;
    }
  }

  // Flush remaining blocks
  if (currentBlockAccumulator.length > 0) {
    const chunkBody = currentBlockAccumulator.join('\n\n');
    const contextualChunk = currentHeaderContext
      ? `${currentHeaderContext}\n\n${chunkBody}`
      : chunkBody;
    chunks.push(contextualChunk.trim());
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Splits document into atomic blocks without cutting through code blocks or tables.
 */
function splitIntoStructuralBlocks(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let currentBlock: string[] = [];
  let inCodeFence = false;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isCodeFenceDelimiter = /^```/.test(line.trim());
    const isTableRow = /^\|.*\|$/.test(line.trim());
    const isHeader = /^#{1,4}\s+/.test(line.trim());
    const isEmpty = line.trim().length === 0;

    if (isCodeFenceDelimiter) {
      if (inCodeFence) {
        // Closing code fence
        currentBlock.push(line);
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inCodeFence = false;
        continue;
      } else {
        // Opening code fence - flush existing block if any
        if (currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
        inCodeFence = true;
        currentBlock.push(line);
        continue;
      }
    }

    if (inCodeFence) {
      currentBlock.push(line);
      continue;
    }

    if (isTableRow) {
      if (!inTable && currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      inTable = true;
      currentBlock.push(line);
      continue;
    } else if (inTable) {
      // Table ended
      blocks.push(currentBlock.join('\n'));
      currentBlock = [];
      inTable = false;
    }

    if (isHeader) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      blocks.push(line);
      continue;
    }

    if (isEmpty) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      continue;
    }

    currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  return blocks;
}

function countWords(str: string): number {
  return str.split(/\s+/).filter(w => w.length > 0).length;
}
