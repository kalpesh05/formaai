/**
 * Historical Support Ticket Ingester
 * Converts CSV and JSON exports of past resolved support tickets (Zendesk, Intercom, Freshdesk, Jira)
 * into structured QA grounding documents so RAG can match real-world symptoms to verified solutions.
 */

export interface ParsedTicket {
  subject: string;
  category?: string;
  query: string;
  resolution: string;
}

export function parseTicketsFromCsv(csvContent: string): ParsedTicket[] {
  const records = parseCsvRecords(csvContent);
  if (records.length === 0) return [];

  const headers = records[0].map(h => h.trim().toLowerCase());
  
  // Detect column indices based on common support export naming conventions
  const subjectIdx = headers.findIndex(h => /^(subject|title|issue_title|ticket_subject|summary)$/i.test(h));
  const queryIdx = headers.findIndex(h => /^(query|description|body|issue|problem|customer_message|content)$/i.test(h));
  const resolutionIdx = headers.findIndex(h => /^(resolution|solution|answer|response|agent_reply|fix)$/i.test(h));
  const categoryIdx = headers.findIndex(h => /^(category|component|tag|module|type)$/i.test(h));

  const tickets: ParsedTicket[] = [];

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (row.length === 0 || row.every(cell => !cell.trim())) continue;

    const subject = subjectIdx >= 0 && row[subjectIdx] ? row[subjectIdx].trim() : `Ticket #${i}`;
    const query = queryIdx >= 0 && row[queryIdx] ? row[queryIdx].trim() : '';
    const resolution = resolutionIdx >= 0 && row[resolutionIdx] ? row[resolutionIdx].trim() : '';
    const category = categoryIdx >= 0 && row[categoryIdx] ? row[categoryIdx].trim() : undefined;

    // A valid ticket record must have at least a query or resolution
    if (query || resolution) {
      tickets.push({
        subject,
        query: query || subject,
        resolution: resolution || 'No resolution recorded.',
        category,
      });
    }
  }

  return tickets;
}

export function parseTicketsFromJson(jsonContent: string): ParsedTicket[] {
  const parsed = JSON.parse(jsonContent);
  const array = Array.isArray(parsed) ? parsed : [parsed];
  const tickets: ParsedTicket[] = [];

  for (const item of array) {
    const subject = item.subject || item.title || item.summary || 'Customer Ticket';
    const query = item.query || item.description || item.body || item.issue || item.message || '';
    const resolution = item.resolution || item.solution || item.answer || item.response || '';
    const category = item.category || item.component || item.tag;

    if (query || resolution) {
      tickets.push({
        subject: String(subject).trim(),
        query: String(query || subject).trim(),
        resolution: String(resolution || 'No resolution recorded.').trim(),
        category: category ? String(category).trim() : undefined,
      });
    }
  }

  return tickets;
}

/**
 * Converts parsed tickets into structured Markdown grounding blocks.
 */
export function formatTicketsToMarkdown(tickets: ParsedTicket[], sourceName: string): string {
  const sections = tickets.map((t, idx) => {
    const categoryLine = t.category ? `**Category / Component:** ${t.category}\n` : '';
    return [
      `### Resolved Ticket #${idx + 1}: ${t.subject}`,
      categoryLine,
      `**Customer Reported Problem / Symptom:**`,
      t.query,
      ``,
      `**Verified Technical Diagnosis & Solution:**`,
      t.resolution,
      `---`
    ].filter(Boolean).join('\n');
  });

  return [
    `# Historical Resolved Support Knowledge: ${sourceName}`,
    `Total cataloged resolutions: ${tickets.length}`,
    `This reference document contains ground-truth past troubleshooting resolutions. When a customer symptom matches an entry below, use the verified solution.`,
    ``,
    ...sections
  ].join('\n\n');
}

/**
 * Lightweight, robust RFC 4180 compliant CSV parser handling quoted multi-line fields.
 */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}
