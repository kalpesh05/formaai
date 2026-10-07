import nodemailer from 'nodemailer';
import { query } from '../config/db';
import { generateEmbedding } from './embeddings';
import { callGemini, ChatMessage } from './router';

export interface InboundEmailPayload {
  workspaceId?: string;
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendReplyOptions {
  senderName?: string;
  senderEmail?: string;
  draftId?: string;
  closeThread?: boolean;
}

/**
 * Parses sender header string (e.g., '"John Doe" <john@example.com>' or 'john@example.com')
 */
export function extractEmailAndName(raw: string): { email: string; name: string } {
  if (!raw) return { email: '', name: '' };
  const trimmed = raw.trim();
  const match = trimmed.match(/^(?:"?([^"]*)"?\s)?<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?$/);
  if (match) {
    const name = match[1]?.trim() || match[2].split('@')[0];
    const email = match[2].trim().toLowerCase();
    return { email, name };
  }
  return { email: trimmed.toLowerCase(), name: trimmed.split('@')[0] || '' };
}

/**
 * Strips quoted conversation history from incoming email body
 * (e.g. lines starting with '>', 'On ... wrote:', '-----Original Message-----')
 */
export function cleanQuotedEmailBody(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const cleanLines: string[] = [];

  for (const line of lines) {
    // Stop processing if standard email reply boundaries are detected
    if (/^-----Original Message-----/i.test(line.trim())) break;
    if (/^_{5,}/.test(line.trim())) break;
    if (/^On\s.+wrote:\s*$/i.test(line.trim())) break;
    if (/^From:\s.+Sent:\s.+/i.test(line.trim())) break;

    // Skip quoted lines starting with '>'
    if (line.trim().startsWith('>')) continue;

    cleanLines.push(line);
  }

  const cleaned = cleanLines.join('\n').trim();
  return cleaned.length > 0 ? cleaned : text.trim();
}

/**
 * Checks for automated bounce notifications, system loops, and auto-responders
 */
export function isAutomatedOrBounceEmail(from: string, subject: string): boolean {
  const normalizedFrom = from.toLowerCase();
  const normalizedSubject = (subject || '').toLowerCase();

  const bounceKeywords = [
    'mailer-daemon@',
    'postmaster@',
    'noreply@',
    'no-reply@',
    'donotreply@',
    'bounce',
    'notification@',
  ];

  if (bounceKeywords.some((kw) => normalizedFrom.includes(kw))) {
    return true;
  }

  const loopSubjects = [
    'auto-reply:',
    'automatic reply:',
    'out of office:',
    'undelivered mail returned to sender',
    'delivery status notification',
  ];

  if (loopSubjects.some((s) => normalizedSubject.startsWith(s))) {
    return true;
  }

  return false;
}

/**
 * Helper to dispatch email via Nodemailer SMTP with fallback logging
 */
async function sendEmailMessage(options: {
  to: string;
  fromName?: string;
  fromEmail?: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ messageId: string }> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const fromSender = options.fromEmail || SMTP_USER || 'support@formaai.com';
  const fromHeader = options.fromName ? `"${options.fromName}" <${fromSender}>` : fromSender;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: SMTP_PORT === '465',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: fromHeader,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      inReplyTo: options.inReplyTo,
      references: options.references,
    });

    return { messageId: info.messageId || `<${Date.now()}@formaai.com>` };
  } else {
    const simulatedId = `<simulated-${Date.now()}@formaai.com>`;
    console.log(
      `[MAILBOX SMTP SIMULATION] SMTP not configured. Simulating delivery to ${options.to}. Subject: ${options.subject}`
    );
    return { messageId: simulatedId };
  }
}

/**
 * Ingests and processes an incoming customer support email.
 * Matches or creates threads, stores messages, runs vector RAG grounding,
 * and either dispatches an autonomous email reply or creates a copilot draft.
 */
export async function processInboundEmail(payload: InboundEmailPayload) {
  const { from, to, subject, text, html, messageId, inReplyTo, references } = payload;
  const { email: senderEmail, name: senderName } = extractEmailAndName(from);
  const cleanQuery = cleanQuotedEmailBody(text || '');

  // 1. Loop and bounce safeguard
  const isLoop = isAutomatedOrBounceEmail(senderEmail, subject);

  // 2. Resolve target workspace
  let targetWorkspaceId = payload.workspaceId;

  if (!targetWorkspaceId && to) {
    // Check if target address matches forwarding pattern: inbound+{workspaceId}@domain.com
    const slugMatch = to.match(/inbound\+([a-f0-9-]+)@/i);
    if (slugMatch) {
      targetWorkspaceId = slugMatch[1];
    } else {
      // Lookup workspace by support or forwarding email
      const wsLookup = await query(
        `SELECT id FROM client_workspaces 
         WHERE LOWER(mailbox_support_email) = LOWER($1) 
            OR LOWER(mailbox_forwarding_address) = LOWER($1)
         LIMIT 1`,
        [to.trim()]
      );
      if (wsLookup.rowCount && wsLookup.rowCount > 0) {
        targetWorkspaceId = wsLookup.rows[0].id;
      }
    }
  }

  if (!targetWorkspaceId) {
    // If only one workspace exists (e.g. initial demo/local dev), fallback gracefully
    const fallbackWs = await query(`SELECT id FROM client_workspaces ORDER BY created_at ASC LIMIT 1`);
    if (fallbackWs.rowCount && fallbackWs.rowCount > 0) {
      targetWorkspaceId = fallbackWs.rows[0].id;
    } else {
      throw new Error(`Target workspace could not be determined for recipient: ${to}`);
    }
  }

  // Fetch workspace details and mailbox settings
  const wsResult = await query(
    `SELECT id, client_name, mailbox_mode, mailbox_auto_threshold, 
            mailbox_support_email, mailbox_assigned_agent_id
     FROM client_workspaces 
     WHERE id = $1`,
    [targetWorkspaceId]
  );

  if (!wsResult.rowCount || wsResult.rowCount === 0) {
    throw new Error(`Workspace not found: ${targetWorkspaceId}`);
  }
  const workspace = wsResult.rows[0];

  // 3. Resolve or create thread
  let threadId: string | null = null;
  const normalizedSubject = subject.replace(/^(?:Re:\s*|Fwd:\s*)+/i, '').trim();

  // A. Try matching by inReplyTo or references in existing messages
  if (inReplyTo || references) {
    const refCandidates = [inReplyTo, references].filter(Boolean) as string[];
    const matchRes = await query(
      `SELECT thread_id FROM mailbox_messages 
       WHERE message_id_header = ANY($1) 
       LIMIT 1`,
      [refCandidates]
    );
    if (matchRes.rowCount && matchRes.rowCount > 0) {
      threadId = matchRes.rows[0].thread_id;
    }
  }

  // B. Try matching by sender email + normalized subject within the last 14 days
  if (!threadId) {
    const threadMatch = await query(
      `SELECT id FROM mailbox_threads 
       WHERE client_workspace_id = $1 
         AND LOWER(customer_email) = LOWER($2)
         AND LOWER(subject) = LOWER($3)
         AND created_at >= NOW() - INTERVAL '14 days'
       ORDER BY last_message_at DESC 
       LIMIT 1`,
      [targetWorkspaceId, senderEmail, normalizedSubject]
    );
    if (threadMatch.rowCount && threadMatch.rowCount > 0) {
      threadId = threadMatch.rows[0].id;
    }
  }

  // C. Create new thread if no match
  if (!threadId) {
    const newThread = await query(
      `INSERT INTO mailbox_threads (
         client_workspace_id, agent_id, subject, customer_email, customer_name, status, ai_status
       ) VALUES ($1, $2, $3, $4, $5, 'open', 'needs_review')
       RETURNING id`,
      [
        targetWorkspaceId,
        workspace.mailbox_assigned_agent_id || null,
        normalizedSubject || 'Support Inquiry',
        senderEmail,
        senderName || null,
      ]
    );
    threadId = newThread.rows[0].id;
  }

  // 4. Save incoming email message
  const genMsgId = messageId || `<${Date.now()}.${Math.random().toString(36).substring(2, 9)}@mail.customer.com>`;
  const msgInsert = await query(
    `INSERT INTO mailbox_messages (
       thread_id, message_id_header, in_reply_to_header, references_header,
       direction, sender_email, sender_name, recipient_email, subject, body_text, body_html, ai_generated
     ) VALUES ($1, $2, $3, $4, 'inbound', $5, $6, $7, $8, $9, $10, false)
     RETURNING id, created_at`,
    [
      threadId,
      genMsgId,
      inReplyTo || null,
      references || null,
      senderEmail,
      senderName || null,
      to,
      subject,
      text || '',
      html || null,
    ]
  );

  // Update thread's last_message_at and ensure it is open
  await query(
    `UPDATE mailbox_threads 
     SET last_message_at = NOW(), status = 'open', updated_at = NOW() 
     WHERE id = $1`,
    [threadId]
  );

  // If this is an automated bounce / system email, skip AI answering
  if (isLoop) {
    await query(`UPDATE mailbox_threads SET ai_status = 'manual_handled' WHERE id = $1`, [threadId]);
    return {
      threadId,
      messageId: msgInsert.rows[0].id,
      status: 'ignored_automated_email',
    };
  }

  // 5. Determine handling Agent
  let agentId = workspace.mailbox_assigned_agent_id;
  let targetAgent: any = null;

  if (agentId) {
    const aRes = await query(`SELECT id, name, config, template_type, llm_model FROM agents WHERE id = $1`, [
      agentId,
    ]);
    if (aRes.rowCount && aRes.rowCount > 0) {
      targetAgent = aRes.rows[0];
    }
  }

  if (!targetAgent) {
    // Find active support or primary agent for this workspace
    const agentSearch = await query(
      `SELECT id, name, config, template_type, llm_model FROM agents 
       WHERE client_workspace_id = $1 AND status = 'live'
       ORDER BY (template_type = 'support') DESC, created_at ASC 
       LIMIT 1`,
      [targetWorkspaceId]
    );
    if (agentSearch.rowCount && agentSearch.rowCount > 0) {
      targetAgent = agentSearch.rows[0];
      agentId = targetAgent.id;
      await query(`UPDATE mailbox_threads SET agent_id = $1 WHERE id = $2`, [agentId, threadId]);
    }
  }

  if (!targetAgent) {
    // No agent configured, flag thread for manual human attention
    await query(`UPDATE mailbox_threads SET ai_status = 'needs_review' WHERE id = $1`, [threadId]);
    return {
      threadId,
      messageId: msgInsert.rows[0].id,
      status: 'no_agent_assigned',
    };
  }

  // 6. Perform Vector RAG Semantic Search
  let chunksText = '';
  let topSimilarity = 0;
  let retrievedChunksList: any[] = [];

  try {
    const userEmbedding = await generateEmbedding(cleanQuery || subject);
    const vectorStr = `[${userEmbedding.join(',')}]`;

    const chunksResult = await query(
      `SELECT content, 1 - (embedding <=> $2::vector) AS similarity 
       FROM chunks 
       WHERE agent_id = $1 
       ORDER BY embedding <=> $2::vector 
       LIMIT 5`,
      [agentId, vectorStr]
    );

    if (chunksResult.rowCount && chunksResult.rowCount > 0) {
      retrievedChunksList = chunksResult.rows;
      topSimilarity = Math.max(0, parseFloat(chunksResult.rows[0].similarity) || 0);
      chunksText = chunksResult.rows.map((r: any) => r.content).join('\n---\n');
    }
  } catch (ragErr: any) {
    console.error('[MAILBOX RAG] Vector search error:', ragErr.message);
  }

  // 7. Generate AI Response via Gemini
  const basePrompt =
    targetAgent.config?.systemPrompt ||
    `You are an expert customer support agent for ${workspace.client_name}. Provide professional, friendly, concise, and accurate email responses. Always greet the customer courteously and sign off professionally.`;

  let systemPrompt = basePrompt;
  if (chunksText) {
    systemPrompt = `${basePrompt}\n\nRetrieved knowledge base documentation:\n---------------------\n${chunksText}\n---------------------\nStrictly base your response on the verified facts above. If information is missing, offer next steps without fabricating answers.`;
  }

  // Fetch recent conversation history in this thread for context
  const historyMessages = await query(
    `SELECT direction, body_text FROM mailbox_messages 
     WHERE thread_id = $1 
     ORDER BY created_at ASC 
     LIMIT 6`,
    [threadId]
  );

  const chatHistory: ChatMessage[] = historyMessages.rows.map((m: any) => ({
    role: m.direction === 'inbound' ? 'user' : 'model',
    content: m.body_text,
  }));

  const activeModel = targetAgent.llm_model || 'gemini-3.8-flash';
  let generatedReply = '';

  try {
    const geminiRes = await callGemini(
      systemPrompt,
      chatHistory.slice(0, -1), // exclude current message
      cleanQuery,
      [],
      activeModel
    );
    generatedReply = geminiRes.reply;
  } catch (aiErr: any) {
    console.error('[MAILBOX AI] Gemini call failed:', aiErr.message);
    await query(`UPDATE mailbox_threads SET ai_status = 'failed' WHERE id = $1`, [threadId]);
    return {
      threadId,
      messageId: msgInsert.rows[0].id,
      status: 'ai_generation_failed',
    };
  }

  // 8. Decide Action based on Workspace Mailbox Mode & Threshold
  const mailboxMode = workspace.mailbox_mode || 'copilot'; // 'autonomous' | 'copilot' | 'manual'
  const autoThreshold = parseFloat(workspace.mailbox_auto_threshold) || 0.75;
  const isConfident = topSimilarity >= autoThreshold;

  if (mailboxMode === 'autonomous' && isConfident) {
    // Mode A: Autonomous Auto-Reply
    const outboundSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const mailResult = await sendEmailMessage({
      to: senderEmail,
      fromName: `${targetAgent.name} (${workspace.client_name})`,
      fromEmail: workspace.mailbox_support_email,
      subject: outboundSubject,
      text: generatedReply,
      inReplyTo: genMsgId,
      references: genMsgId,
    });

    await query(
      `INSERT INTO mailbox_messages (
         thread_id, message_id_header, in_reply_to_header, references_header,
         direction, sender_email, sender_name, recipient_email, subject, body_text, ai_generated
       ) VALUES ($1, $2, $3, $4, 'outbound', $5, $6, $7, $8, $9, true)`,
      [
        threadId,
        mailResult.messageId,
        genMsgId,
        genMsgId,
        workspace.mailbox_support_email || 'support@formaai.com',
        targetAgent.name,
        senderEmail,
        outboundSubject,
        generatedReply,
      ]
    );

    await query(
      `UPDATE mailbox_threads 
       SET ai_status = 'auto_replied', last_message_at = NOW(), updated_at = NOW() 
       WHERE id = $1`,
      [threadId]
    );

    return {
      threadId,
      status: 'auto_replied',
      confidence: topSimilarity,
      reply: generatedReply,
    };
  } else if (mailboxMode === 'manual') {
    // Mode B: Manual Mode - purely human inbox
    await query(`UPDATE mailbox_threads SET ai_status = 'needs_review' WHERE id = $1`, [threadId]);
    return {
      threadId,
      status: 'manual_mode',
      confidence: topSimilarity,
    };
  } else {
    // Mode C: Copilot Mode (or Autonomous with similarity below threshold)
    // Create draft in copilot_drafts table
    const draftInsert = await query(
      `INSERT INTO copilot_drafts (
         agent_id, thread_id, user_query, draft_reply, confidence_score, citations, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id`,
      [
        agentId,
        threadId,
        cleanQuery,
        generatedReply,
        topSimilarity.toFixed(4),
        JSON.stringify(retrievedChunksList.slice(0, 3).map((c: any) => ({ content: c.content, similarity: c.similarity }))),
      ]
    );

    await query(
      `UPDATE mailbox_threads 
       SET ai_status = 'draft_ready', updated_at = NOW() 
       WHERE id = $1`,
      [threadId]
    );

    return {
      threadId,
      status: 'draft_ready',
      draftId: draftInsert.rows[0].id,
      confidence: topSimilarity,
      draftReply: generatedReply,
    };
  }
}

/**
 * Sends a human or approved AI draft reply to a mailbox thread
 */
export async function sendThreadReply(
  threadId: string,
  replyText: string,
  options: SendReplyOptions = {}
) {
  // 1. Fetch thread and workspace
  const threadRes = await query(
    `SELECT t.id, t.client_workspace_id, t.subject, t.customer_email, t.customer_name,
            w.client_name, w.mailbox_support_email
     FROM mailbox_threads t
     JOIN client_workspaces w ON t.client_workspace_id = w.id
     WHERE t.id = $1`,
    [threadId]
  );

  if (!threadRes.rowCount || threadRes.rowCount === 0) {
    throw new Error('Thread not found');
  }
  const thread = threadRes.rows[0];

  // 2. Retrieve latest inbound message to set email headers
  const latestInboundRes = await query(
    `SELECT message_id_header FROM mailbox_messages 
     WHERE thread_id = $1 AND direction = 'inbound' 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [threadId]
  );
  const latestInboundId = latestInboundRes.rows[0]?.message_id_header;

  // 3. Dispatch email via SMTP
  const outboundSubject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`;
  const senderName = options.senderName || `${thread.client_name} Support`;
  const senderEmail = options.senderEmail || thread.mailbox_support_email || 'support@formaai.com';

  const mailResult = await sendEmailMessage({
    to: thread.customer_email,
    fromName: senderName,
    fromEmail: senderEmail,
    subject: outboundSubject,
    text: replyText,
    inReplyTo: latestInboundId,
    references: latestInboundId,
  });

  // 4. Save outbound message record
  const msgInsert = await query(
    `INSERT INTO mailbox_messages (
       thread_id, message_id_header, in_reply_to_header, references_header,
       direction, sender_email, sender_name, recipient_email, subject, body_text, ai_generated
     ) VALUES ($1, $2, $3, $4, 'outbound', $5, $6, $7, $8, $9, false)
     RETURNING id, created_at`,
    [
      threadId,
      mailResult.messageId,
      latestInboundId || null,
      latestInboundId || null,
      senderEmail,
      senderName,
      thread.customer_email,
      outboundSubject,
      replyText,
    ]
  );

  // 5. If approving a draft, mark draft as approved
  if (options.draftId) {
    await query(
      `UPDATE copilot_drafts 
       SET status = 'approved', edited_reply = $1, reviewed_by = $2, updated_at = NOW() 
       WHERE id = $3`,
      [replyText, senderName, options.draftId]
    );
  }

  // 6. Update thread status
  const nextStatus = options.closeThread ? 'resolved' : 'open';
  await query(
    `UPDATE mailbox_threads 
     SET status = $1, ai_status = 'manual_handled', last_message_at = NOW(), updated_at = NOW() 
     WHERE id = $2`,
    [nextStatus, threadId]
  );

  return {
    success: true,
    messageId: msgInsert.rows[0].id,
    threadStatus: nextStatus,
  };
}

/**
 * Retrieves thread details with all messages and pending draft
 */
export async function getThreadDetails(threadId: string) {
  const threadRes = await query(
    `SELECT t.id, t.client_workspace_id, t.agent_id, t.subject, t.customer_email, 
            t.customer_name, t.status, t.ai_status, t.last_message_at, t.created_at,
            a.name as agent_name, w.client_name, w.mailbox_support_email, w.mailbox_mode
     FROM mailbox_threads t
     JOIN client_workspaces w ON t.client_workspace_id = w.id
     LEFT JOIN agents a ON t.agent_id = a.id
     WHERE t.id = $1`,
    [threadId]
  );

  if (!threadRes.rowCount || threadRes.rowCount === 0) {
    throw new Error('Thread not found');
  }
  const thread = threadRes.rows[0];

  const messagesRes = await query(
    `SELECT id, thread_id, direction, sender_email, sender_name, recipient_email,
            subject, body_text, body_html, ai_generated, created_at 
     FROM mailbox_messages 
     WHERE thread_id = $1 
     ORDER BY created_at ASC`,
    [threadId]
  );

  const draftRes = await query(
    `SELECT id, user_query, draft_reply, confidence_score, citations, status, created_at
     FROM copilot_drafts 
     WHERE thread_id = $1 AND status = 'pending' 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [threadId]
  );

  return {
    thread,
    messages: messagesRes.rows,
    pendingDraft: draftRes.rows[0] || null,
  };
}
