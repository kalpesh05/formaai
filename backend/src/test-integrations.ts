import { executeTool } from './services/tools';
import { runMigrations } from './db/migrate';
import pool, { query } from './config/db';

async function runTests() {
  console.log('--- Starting Nodemailer & Cal.com API Integration Tests ---');

  // Initialize DB schema
  await runMigrations();

  // Create dummy agency
  const agencyInsert = await query(
    `INSERT INTO agencies (name, email, password_hash)
     VALUES ('Integration Agency', 'agency.integration@example.com', 'dummy_hash') RETURNING id`
  );
  const agencyId = agencyInsert.rows[0].id;

  // Create workspace and agent to get a valid agent ID
  const wsInsert = await query(
    `INSERT INTO client_workspaces (client_name, agency_id) VALUES ('Integration Client', $1) RETURNING id`,
    [agencyId]
  );
  const wsId = wsInsert.rows[0].id;
  const agentInsert = await query(
    `INSERT INTO agents (client_workspace_id, template_type, name, llm_provider, llm_model, status)
     VALUES ($1, 'support', 'Integration Agent', 'gemini', 'gemini-1.5-flash', 'draft') RETURNING id`,
    [wsId]
  );
  const agentId = agentInsert.rows[0].id;

  try {
    // 1. Test fallback schedule booking (No Cal.com keys configured)
    console.log('Testing Cal.com booking fallback...');
    const result1 = await executeTool(
      'book_calendar_slot',
      {
        date: '2026-09-02',
        time: '11:00',
        attendee_email: 'fallback@example.com'
      },
      { agentId }
    );
    console.log('Fallback booking result:', result1);
    if (!result1.success || !result1.data || !result1.data.booking_id.startsWith('fa_cal_')) {
      throw new Error(`Expected fallback booking success, got: ${JSON.stringify(result1)}`);
    }
    console.log('SUCCESS: Fallback booking scheduler validated.');

    // 2. Test live Cal.com scheduling code path (Mocking external API fetch)
    console.log('Testing live Cal.com scheduling API call (with mocked network fetch)...');
    
    // Store original global fetch
    const originalFetch = global.fetch;
    let fetchCalled = false;
    let fetchPayload: any = null;

    // Override global fetch
    (global as any).fetch = async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://api.cal.com/v1/bookings')) {
        fetchCalled = true;
        fetchPayload = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            booking: {
              id: 987654321,
              videoCallData: {
                url: 'https://meet.google.com/cal-live-video-call'
              }
            }
          })
        } as Response;
      }
      return originalFetch(url, init);
    };

    // Run execution with simulated credentials inside toolConfig
    const result2 = await executeTool(
      'book_calendar_slot',
      {
        date: '2026-09-02',
        time: '11:00',
        attendee_email: 'live-cal@example.com'
      },
      {
        agentId,
        toolConfig: {
          cal_api_key: 'cal_secret_apikey_998877',
          cal_event_type_id: '12345'
        }
      }
    );

    // Restore fetch
    global.fetch = originalFetch;

    console.log('Live booking result:', result2);
    if (!fetchCalled) {
      throw new Error('Cal.com external API fetch call was not initiated');
    }
    if (!result2.success || !result2.data || result2.data.booking_id !== 987654321 || result2.data.meeting_link !== 'https://meet.google.com/cal-live-video-call') {
      throw new Error(`Cal.com mock API output mismatch: ${JSON.stringify(result2)}`);
    }
    console.log('Cal.com payload sent to API:', fetchPayload);
    if (fetchPayload.eventTypeId !== 12345 || fetchPayload.responses.email !== 'live-cal@example.com') {
      throw new Error('Cal.com payload data mismatch');
    }
    console.log('SUCCESS: Cal.com API call contract verified.');

    // 3. Test tickets SMTP email dispatch fallbacks
    console.log('Testing tickets creation and SMTP email dispatch fallbacks...');
    const result3 = await executeTool(
      'create_support_ticket',
      {
        subject: 'Database Integration Failure',
        description: 'Failed to establish persistent network socket connections.'
      },
      { agentId }
    );
    console.log('Ticket creation result:', result3);
    if (!result3.success || !result3.data || !result3.data.ticket_id) {
      throw new Error('Ticket creation failed');
    }

    // Verify tickets and action_logs database rows
    const ticketRow = await query('SELECT subject, status FROM tickets WHERE id = $1', [result3.data.ticket_id]);
    if (ticketRow.rowCount !== 1 || ticketRow.rows[0].status !== 'open') {
      throw new Error('Ticket record not stored or status incorrect');
    }
    console.log('SUCCESS: Ticket stored and SMTP fallback completed.');

    console.log('\n--- ALL NODEMAILER & CAL.COM INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
  } catch (error: any) {
    console.error('\n--- TEST RUN FAILED! ---');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    console.log('Closing database connection...');
    await pool.end();
  }
}

runTests();
