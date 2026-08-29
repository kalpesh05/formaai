import app from './app';
import { runMigrations } from './db/migrate';
import pool, { query } from './config/db';
import { generateEmbedding } from './services/embeddings';

const PORT = 5005; // Run query tests on port 5005
const API_URL = `http://localhost:${PORT}/api/v1`;

async function runTests() {
  console.log('--- Starting RAG Query Service & LLM Router Tests ---');

  // Initialize DB schema
  await runMigrations();
  const server = app.listen(PORT);
  console.log(`Query test server listening on port ${PORT}`);

  try {
    // 1. Create Agency A & Workspace A1
    console.log('Registering Agency A...');
    const signupARes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency A',
        email: `agency.query.a.${Date.now()}@example.com`,
        password: 'password123',
      })
    });
    const signupAData = await signupARes.json() as any;
    const tokenA = signupAData.token;

    console.log('Creating Workspace A1...');
    const wsA1Res = await fetch(`${API_URL}/workspaces`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ client_name: 'Workspace A1' })
    });
    const wsA1Data = await wsA1Res.json() as any;
    const wsA1Id = wsA1Data.id;

    // 2. Create Support Agent A1
    console.log('Creating Support Agent...');
    const agentCreateRes = await fetch(`${API_URL}/workspaces/${wsA1Id}/agents`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        template_type: 'support',
        name: 'RAG Query Test Agent'
      })
    });
    const agentData = await agentCreateRes.json() as any;
    const agentId = agentData.id;

    // 3. Inject mock database chunks directly for vector search matching
    console.log('Seeding knowledge base vector chunks...');
    const chunk1Content = 'Forma AI monthly billing rates start at $49 per month for the basic tier. The professional tier is priced at $199 per month.';
    const chunk2Content = 'The system supports multi-tenant workspace isolation. Each agency workspace has an independent database scoping layer.';

    const embed1 = await generateEmbedding(chunk1Content);
    const embed2 = await generateEmbedding(chunk2Content);

    // Insert dummy data source
    const dsInsert = await query(
      `INSERT INTO data_sources (agent_id, source_type, source_ref, status)
       VALUES ($1, 'file', 'mock_billing_FAQ.txt', 'processed') RETURNING id`,
      [agentId]
    );
    const dsId = dsInsert.rows[0].id;

    await query(
      `INSERT INTO chunks (agent_id, data_source_id, content, embedding)
       VALUES ($1, $2, $3, $4::vector), ($1, $2, $5, $6::vector)`,
      [agentId, dsId, chunk1Content, `[${embed1.join(',')}]`, chunk2Content, `[${embed2.join(',')}]`]
    );
    console.log('Knowledge base chunks seeded successfully.');

    // 4. Test RAG query using dashboard auth (JWT)
    console.log('Sending RAG query via Dashboard Authorization...');
    const query1Res = await fetch(`${API_URL}/agents/${agentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ message: 'What are the billing plans for Forma AI?' })
    });

    if (!query1Res.ok) {
      throw new Error(`Query failed: ${query1Res.statusText} (${await query1Res.text()})`);
    }

    const query1Data = await query1Res.json() as any;
    const conversationId = query1Data.conversation_id;
    console.log(`Query response: "${query1Data.reply}"`);
    console.log(`Conversation session ID: ${conversationId}`);

    if (!conversationId) {
      throw new Error('Expected conversation_id to be returned');
    }
    console.log('SUCCESS: First RAG query succeeded.');

    // 5. Test message history persistence
    console.log('Sending follow-up query in same conversation session...');
    const query2Res = await fetch(`${API_URL}/agents/${agentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        message: 'And what was the price of the professional plan again?',
        conversation_id: conversationId
      })
    });

    if (!query2Res.ok) {
      throw new Error(`Follow-up query failed: ${query2Res.statusText}`);
    }

    const query2Data = await query2Res.json() as any;
    console.log(`Follow-up response: "${query2Data.reply}"`);

    // Verify messages table logs (should contain 4 messages: 2 user, 2 assistant)
    const messagesRes = await query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId]
    );
    console.log(`Database logged ${messagesRes.rowCount} messages in conversation.`);
    if (messagesRes.rowCount !== 4) {
      throw new Error(`Expected 4 messages, got ${messagesRes.rowCount}`);
    }
    console.log('SUCCESS: Conversation history logged and fetched correctly.');

    // 6. Test Deploy & Widget API Key Auth
    console.log('Deploying agent to request an API key...');
    const deployRes = await fetch(`${API_URL}/agents/${agentId}/deploy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const deployData = await deployRes.json() as any;
    const apiKey = deployData.api_key;
    console.log(`Live API Key issued: ${apiKey}`);

    console.log('Executing query using Widget Header Auth (X-Agent-Key)...');
    const widgetQueryRes = await fetch(`${API_URL}/agents/${agentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': apiKey // Auth via widget key
      },
      body: JSON.stringify({ message: 'Explain multi-tenant isolation configuration.' })
    });

    if (!widgetQueryRes.ok) {
      throw new Error(`Widget key auth query failed: ${widgetQueryRes.statusText} (${await widgetQueryRes.text()})`);
    }

    const widgetData = await widgetQueryRes.json() as any;
    console.log(`Widget query response: "${widgetData.reply}"`);
    console.log('SUCCESS: Widget key authentication verified.');

    // 7. Test Function Calling stubs
    console.log('Sending query to trigger mock calendar booking tool call...');
    const bookingRes = await fetch(`${API_URL}/agents/${agentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': apiKey
      },
      body: JSON.stringify({ message: 'Can we schedule a calendar demo call?' })
    });

    const bookingData = await bookingRes.json() as any;
    console.log('Tool calls detected in response:', bookingData.tool_calls);
    if (!bookingData.tool_calls || bookingData.tool_calls.length === 0 || bookingData.tool_calls[0].name !== 'book_calendar_slot') {
      throw new Error('Tool booking request did not trigger expected book_calendar_slot action stub');
    }
    console.log('SUCCESS: Function tool-calling stubs triggered successfully.');

    // 8. SECURITY GATES: Agency B attempts unauthorized access
    console.log('Registering Agency B...');
    const signupBRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency B',
        email: `agency.query.b.${Date.now()}@example.com`,
        password: 'password123',
      })
    });
    const signupBData = await signupBRes.json() as any;
    const tokenB = signupBData.token;

    console.log('CRITICAL: Agency B attempting to query Agency A\'s agent using Bearer JWT...');
    const bQueryRes = await fetch(`${API_URL}/agents/${agentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({ message: 'Hack attempt' })
    });
    if (bQueryRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${bQueryRes.status}`);
    }

    console.log('CRITICAL: Widget request using incorrect X-Agent-Key...');
    const badKeyRes = await fetch(`${API_URL}/agents/${agentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': 'fa_live_fakekey12345'
      },
      body: JSON.stringify({ message: 'Hack attempt' })
    });
    if (badKeyRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${badKeyRes.status}`);
    }
    console.log('SUCCESS: All security isolation gates verified.');

    console.log('\n--- ALL RAG QUERY SERVICE TESTS PASSED SUCCESSFULLY! ---');
  } catch (error: any) {
    console.error('\n--- TEST RUN FAILED! ---');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    console.log('Closing server and database connection...');
    server.close();
    await pool.end();
  }
}

runTests();
