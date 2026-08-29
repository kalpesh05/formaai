import app from './app';
import { runMigrations } from './db/migrate';
import pool, { query } from './config/db';

const PORT = 5006; // Run tool integration tests on port 5006
const API_URL = `http://localhost:${PORT}/api/v1`;

async function runTests() {
  console.log('--- Starting Tool Service & Agentic Action Loop Tests ---');

  // Initialize DB schema (including tickets table)
  await runMigrations();
  const server = app.listen(PORT);
  console.log(`Tool test server listening on port ${PORT}`);

  try {
    // 1. Create Agency A & Workspace A1
    console.log('Registering Agency A...');
    const signupARes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency A',
        email: `agency.tools.a.${Date.now()}@example.com`,
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

    // 2. Create Support Agent A1 (comes pre-seeded with create_support_ticket and calendar_booking)
    console.log('Creating Support Agent...');
    const agentCreateRes = await fetch(`${API_URL}/workspaces/${wsA1Id}/agents`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        template_type: 'support',
        name: 'Agentic Tools Test Agent'
      })
    });
    const agentData = await agentCreateRes.json() as any;
    const agentId = agentData.id;

    // 3. Deploy agent to get widget API key
    console.log('Deploying agent to acquire API key...');
    const deployRes = await fetch(`${API_URL}/agents/${agentId}/deploy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const deployData = await deployRes.json() as any;
    const apiKey = deployData.api_key;
    console.log(`Live widget key: ${apiKey}`);

    // 4. Test book_calendar_slot tool execution
    console.log('Sending query: "Can you schedule a demo slot on the calendar for me?"');
    const query1Res = await fetch(`${API_URL}/agents/${agentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': apiKey
      },
      body: JSON.stringify({ message: 'Can you schedule a demo slot on the calendar for me?' })
    });

    if (!query1Res.ok) {
      throw new Error(`Query failed: ${query1Res.statusText} (${await query1Res.text()})`);
    }

    const query1Data = await query1Res.json() as any;
    console.log('Response reply:', query1Data.reply);
    console.log('Actions taken:', query1Data.actions_taken);

    // Verify actions taken logs
    if (!query1Data.actions_taken || query1Data.actions_taken.length === 0) {
      throw new Error('Expected calendar booking tool to execute');
    }
    const bookingAction = query1Data.actions_taken[0];
    if (bookingAction.tool_type !== 'book_calendar_slot' || bookingAction.status !== 'success') {
      throw new Error(`Expected successful book_calendar_slot execution, got: ${JSON.stringify(bookingAction)}`);
    }
    console.log('SUCCESS: book_calendar_slot tool executed and resolved successfully.');

    // 5. Verify action_logs database record
    console.log('Inspecting action_logs table...');
    const actionLogsResult = await query(
      `SELECT action_type, status, action_input, action_result FROM action_logs WHERE agent_id = $1`,
      [agentId]
    );
    console.log(`Found ${actionLogsResult.rowCount} rows in action_logs.`);
    if (actionLogsResult.rowCount !== 1) {
      throw new Error(`Expected exactly 1 log entry, got ${actionLogsResult.rowCount}`);
    }
    const logEntry = actionLogsResult.rows[0];
    console.log(`Log entry detail - Type: ${logEntry.action_type}, Status: ${logEntry.status}`);
    if (logEntry.status !== 'success') {
      throw new Error(`Expected action status success, got ${logEntry.status}`);
    }
    console.log('SUCCESS: Action audit log successfully written to database.');

    // 6. Test create_support_ticket tool execution
    console.log('Sending query: "I need to open a support ticket for my login problems."');
    const query2Res = await fetch(`${API_URL}/agents/${agentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': apiKey
      },
      body: JSON.stringify({ message: 'I need to open a support ticket for my login problems.' })
    });

    const query2Data = await query2Res.json() as any;
    console.log('Response reply:', query2Data.reply);
    console.log('Actions taken:', query2Data.actions_taken);

    if (!query2Data.actions_taken || query2Data.actions_taken.length === 0) {
      throw new Error('Expected support ticket tool to execute');
    }
    const ticketAction = query2Data.actions_taken[0];
    if (ticketAction.tool_type !== 'create_support_ticket' || ticketAction.status !== 'success') {
      throw new Error(`Expected successful create_support_ticket execution, got: ${JSON.stringify(ticketAction)}`);
    }
    console.log('SUCCESS: create_support_ticket tool executed and resolved successfully.');

    // 7. Verify tickets database record
    console.log('Inspecting tickets database table...');
    const ticketsResult = await query(
      `SELECT id, subject, status, description FROM tickets WHERE agent_id = $1`,
      [agentId]
    );
    console.log(`Found ${ticketsResult.rowCount} tickets in database.`);
    if (ticketsResult.rowCount !== 1) {
      throw new Error(`Expected 1 ticket record, got ${ticketsResult.rowCount}`);
    }
    const dbTicket = ticketsResult.rows[0];
    console.log(`Ticket logged - ID: ${dbTicket.id}, Subject: "${dbTicket.subject}", Status: ${dbTicket.status}`);
    console.log('SUCCESS: Support ticket table verified.');

    // 8. Verify action_logs has 2 entries now
    const actionLogs2 = await query(
      `SELECT action_type, status FROM action_logs WHERE agent_id = $1`,
      [agentId]
    );
    if (actionLogs2.rowCount !== 2) {
      throw new Error(`Expected 2 action logs in database, got ${actionLogs2.rowCount}`);
    }
    console.log('SUCCESS: All action logs populated correctly.');

    console.log('\n--- ALL TOOL ADAPTER & AGENT LOOP TESTS PASSED SUCCESSFULLY! ---');
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
