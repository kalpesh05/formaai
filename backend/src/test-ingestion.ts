import http from 'http';
import app from './app';
import { runMigrations } from './db/migrate';
import pool, { query } from './config/db';

const PORT = 5003; 
const MOCK_PORT = 5004;
const API_URL = `http://localhost:${PORT}/api/v1`;

const mockServer = http.createServer((req, res) => {
  console.log(`[MOCK SERVER] Incoming request: ${req.method} ${req.url}`);
  if (req.url === '/test-mock-page') {
    console.log('[MOCK SERVER] Returning mock page content.');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Resetting Your Password - Help Center</title>
        </head>
        <body>
          <header>
            <nav>
              <a href="/home">Home</a> | <a href="/contact">Support</a>
            </nav>
          </header>
          <main id="content">
            <article>
              <h1>Resetting Your Password</h1>
              <p>To reset your account password, click on the "Forgot Password" link located on the login page.</p>
              <p>Enter your registered email address and hit send. You will receive an email containing a secure link to choose a new password.</p>
              <p>If you don't receive the password reset email within 10 minutes, check your junk folder or contact the system administrator.</p>
            </article>
          </main>
        </body>
      </html>
    `);
  } else {
    console.log(`[MOCK SERVER] Route not matched, returning 404 for: ${req.url}`);
    res.writeHead(404);
    res.end();
  }
});

async function runTests() {
  console.log('--- Starting Ingestion Pipeline Tests ---');

  // Initialize DB
  await runMigrations();
  mockServer.listen(MOCK_PORT);
  console.log(`Mock HTML server listening on port ${MOCK_PORT}`);
  const server = app.listen(PORT);
  console.log(`Ingestion test server listening on port ${PORT}`);

  try {
    // 1. Create Agency A & Workspace A1
    console.log('Registering Agency A...');
    const uniqueEmailA = `agency.ingestion.a.${Date.now()}@example.com`;
    const signupARes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency A',
        email: uniqueEmailA,
        password: 'password123',
      })
    });
    
    if (!signupARes.ok) {
      throw new Error(`Failed to register Agency A: ${signupARes.statusText} (${await signupARes.text()})`);
    }
    
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
    
    if (!wsA1Res.ok) {
      throw new Error(`Failed to create Workspace A1: ${wsA1Res.statusText} (${await wsA1Res.text()})`);
    }
    
    const wsA1Data = await wsA1Res.json() as any;
    const wsA1Id = wsA1Data.id;

    // 2. Create Agent A1
    console.log('Creating Support Agent...');
    const agentCreateRes = await fetch(`${API_URL}/workspaces/${wsA1Id}/agents`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        template_type: 'support',
        name: 'Ingestion Test Agent'
      })
    });
    
    if (!agentCreateRes.ok) {
      throw new Error(`Failed to create agent: ${agentCreateRes.statusText} (${await agentCreateRes.text()})`);
    }
    
    const agentData = await agentCreateRes.json() as any;
    const agentId = agentData.id;

    // 3. Test File Ingestion using Native FormData & Blob
    console.log('Uploading sample document file...');
    const formData = new FormData();
    const fileContent = 'Forma AI offers custom workspace solutions. Agencies can manage multiple clients in this single dashboard. Each client has a dedicated agent to assist users with support and sales requests. Support tickets are automatically logged into the central client system.';
    
    // Create a text file blob
    const blob = new Blob([fileContent], { type: 'text/plain' });
    formData.append('file', blob, 'features_guide.txt');

    const fileUploadRes = await fetch(`${API_URL}/agents/${agentId}/data-sources/file`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenA}`
      },
      body: formData
    });

    if (!fileUploadRes.ok) {
      throw new Error(`File upload failed: ${fileUploadRes.statusText} (${await fileUploadRes.text()})`);
    }

    const fileSourceData = await fileUploadRes.json() as any;
    const fileSourceId = fileSourceData.id;
    console.log(`File Data Source created with ID: ${fileSourceId}. Status: ${fileSourceData.status}`);
    
    if (fileSourceData.status !== 'pending') {
      throw new Error(`Expected initial status 'pending', got ${fileSourceData.status}`);
    }

    // 4. Test URL Ingestion pointing to our hermetic test server endpoint
    console.log('Ingesting local mock URL page...');
    const urlUploadRes = await fetch(`${API_URL}/agents/${agentId}/data-sources/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ url: `http://localhost:${MOCK_PORT}/test-mock-page` })
    });

    if (!urlUploadRes.ok) {
      throw new Error(`URL upload failed: ${urlUploadRes.statusText}`);
    }

    const urlSourceData = await urlUploadRes.json() as any;
    const urlSourceId = urlSourceData.id;
    console.log(`URL Data Source created with ID: ${urlSourceId}. Status: ${urlSourceData.status}`);

    // 5. Wait for background async processes and poll for status completion
    console.log('Waiting for async ingestion processing...');
    let fileProcessed = false;
    let urlProcessed = false;
    let attempts = 0;

    while (attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      const listRes = await fetch(`${API_URL}/agents/${agentId}/data-sources`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokenA}` }
      });
      const sources = await listRes.json() as any[];
      
      const fileSource = sources.find(s => s.id === fileSourceId);
      const urlSource = sources.find(s => s.id === urlSourceId);

      if (fileSource && fileSource.status === 'processed') {
        fileProcessed = true;
      }
      if (urlSource && urlSource.status === 'processed') {
        urlProcessed = true;
      }

      if (fileSource?.status === 'failed' || urlSource?.status === 'failed') {
        throw new Error('One of the data sources failed processing');
      }

      if (fileProcessed && urlProcessed) {
        break;
      }
    }

    if (!fileProcessed || !urlProcessed) {
      throw new Error('Ingestion processing timed out without success state.');
    }
    console.log('SUCCESS: Both data sources processed successfully.');

    // 6. Query the database directly to inspect the chunks & pgvector configurations
    console.log('Inspecting created chunks in the database...');
    const chunksRes = await query(
      `SELECT id, content, vector_dims(embedding) as vec_dim 
       FROM chunks 
       WHERE agent_id = $1`, 
      [agentId]
    );

    console.log(`Found ${chunksRes.rowCount} database chunks.`);
    if (!chunksRes.rowCount || chunksRes.rowCount === 0) {
      throw new Error('No chunks were inserted in the database');
    }

    // Verify vector size is 768 (matching Gemini text-embedding-004)
    const firstChunk = chunksRes.rows[0];
    console.log(`Vector dimensions: ${firstChunk.vec_dim} (Expected: 768)`);
    if (firstChunk.vec_dim !== 768) {
      throw new Error(`Database vector dimension size mismatch: Expected 768, got ${firstChunk.vec_dim}`);
    }
    console.log('SUCCESS: Chunks verified with correct 768-dimension vectors.');

    // 7. SECURITY GATES: Agency B attempts unauthorized access
    console.log('Registering Agency B...');
    const uniqueEmailB = `agency.ingestion.b.${Date.now()}@example.com`;
    const signupBRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency B',
        email: uniqueEmailB,
        password: 'password123',
      })
    });
    
    if (!signupBRes.ok) {
      throw new Error(`Failed to register Agency B: ${signupBRes.statusText} (${await signupBRes.text()})`);
    }
    
    const signupBData = await signupBRes.json() as any;
    const tokenB = signupBData.token;

    console.log('CRITICAL: Agency B attempting to list data sources of Agency A\'s agent...');
    const bListRes = await fetch(`${API_URL}/agents/${agentId}/data-sources`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    if (bListRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${bListRes.status}`);
    }

    console.log('CRITICAL: Agency B attempting to upload URL to Agency A\'s agent...');
    const bUrlRes = await fetch(`${API_URL}/agents/${agentId}/data-sources/url`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({ url: 'http://localhost/hack' })
    });
    if (bUrlRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${bUrlRes.status}`);
    }
    console.log('SUCCESS: All security isolation gates verified.');

    console.log('\n--- ALL INGESTION PIPELINE TESTS PASSED SUCCESSFULLY! ---');
  } catch (error: any) {
    console.error('\n--- TEST RUN FAILED! ---');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    console.log('Closing server and database connection...');
    server.close();
    mockServer.close();
    await pool.end();
  }
}

runTests();
