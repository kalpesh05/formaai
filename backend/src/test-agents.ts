import app from './app';
import { runMigrations } from './db/migrate';
import pool from './config/db';

const PORT = 5002; // Run agent tests on a separate port
const API_URL = `http://localhost:${PORT}/api/v1`;

async function runTests() {
  console.log('--- Starting Agent Configuration & Deployment Tests ---');

  // Ensure DB is initialized
  await runMigrations();
  const server = app.listen(PORT);
  console.log(`Agent test server listening on port ${PORT}`);

  try {
    // 1. Create Agency A
    console.log('Registering Agency A...');
    const signupARes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency A',
        email: 'agency.a2@example.com',
        password: 'password123',
      })
    });
    const signupAData = await signupARes.json() as any;
    const tokenA = signupAData.token;

    // 2. Create Workspace A1 under Agency A
    console.log('Creating Workspace A1 for Agency A...');
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

    // 3. Agency A creates a Support Agent in Workspace A1
    console.log("Creating Support Agent 'Joe Customer Care'...");
    const agentCreateRes = await fetch(`${API_URL}/workspaces/${wsA1Id}/agents`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        template_type: 'support',
        name: 'Joe Customer Care'
      })
    });

    if (!agentCreateRes.ok) {
      throw new Error(`Failed to create agent: ${agentCreateRes.statusText} (${await agentCreateRes.text()})`);
    }

    const agentData = await agentCreateRes.json() as any;
    const agentId = agentData.id;
    console.log(`Agent created with ID: ${agentId}`);
    
    // Assert on agent structure and auto-seeded tools
    if (agentData.status !== 'draft') {
      throw new Error(`Expected agent status to be 'draft', got: ${agentData.status}`);
    }
    if (!agentData.tools || agentData.tools.length !== 1 || agentData.tools[0].tool_type !== 'ticket_create') {
      throw new Error('Support agent was not initialized with the default ticket_create tool');
    }
    console.log('SUCCESS: Agent and default tools auto-seeded correctly.');

    // 4. Agency A lists agents in Workspace A1
    console.log('Listing agents in Workspace A1...');
    const listRes = await fetch(`${API_URL}/workspaces/${wsA1Id}/agents`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const listData = await listRes.json() as any[];
    if (listData.length !== 1 || listData[0].id !== agentId) {
      throw new Error('Agent list mismatch');
    }
    console.log('SUCCESS: Agent list retrieved successfully.');

    // 5. Agency A fetches full agent details
    console.log('Fetching full agent details...');
    const detailRes = await fetch(`${API_URL}/agents/${agentId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const detailData = await detailRes.json() as any;
    if (detailData.tools[0].tool_type !== 'ticket_create' || !Array.isArray(detailData.data_sources)) {
      throw new Error('Detailed agent payload invalid');
    }
    console.log('SUCCESS: Full agent details fetched successfully.');

    // 6. Agency A updates agent config
    console.log('Patching agent config...');
    const patchRes = await fetch(`${API_URL}/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        name: 'Joe Support Pro',
        llm_provider: 'openai',
        llm_model: 'gpt-4o',
        config: { systemPrompt: 'Overwritten system prompt.' }
      })
    });
    const patchData = await patchRes.json() as any;
    if (patchData.name !== 'Joe Support Pro' || patchData.llm_provider !== 'openai' || patchData.config.systemPrompt !== 'Overwritten system prompt.') {
      throw new Error('Agent patch update failed');
    }
    console.log('SUCCESS: Agent config patched successfully.');

    // 7. Agency A deploys agent
    console.log('Deploying agent...');
    const deployRes = await fetch(`${API_URL}/agents/${agentId}/deploy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const deployData = await deployRes.json() as any;
    console.log(`Agent deployed with API Key: ${deployData.api_key}`);
    
    if (!deployData.api_key.startsWith('fa_live_')) {
      throw new Error('API key must be prefixed with fa_live_');
    }
    if (deployData.status !== 'live') {
      throw new Error('Expected deployed status to be live');
    }
    console.log('SUCCESS: Agent successfully deployed with prefixed API key.');

    // 8. SECURITY CHECK: Agency B (another tenant) attempts unauthorized operations
    console.log('Registering Agency B...');
    const signupBRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency B',
        email: 'agency.b2@example.com',
        password: 'password123',
      })
    });
    const signupBData = await signupBRes.json() as any;
    const tokenB = signupBData.token;

    console.log('CRITICAL: Agency B attempting to list agents in Agency A\'s workspace...');
    const bListRes = await fetch(`${API_URL}/workspaces/${wsA1Id}/agents`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    if (bListRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${bListRes.status}`);
    }

    console.log('CRITICAL: Agency B attempting to fetch Agency A\'s agent details...');
    const bDetailRes = await fetch(`${API_URL}/agents/${agentId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    if (bDetailRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${bDetailRes.status}`);
    }

    console.log('CRITICAL: Agency B attempting to patch Agency A\'s agent config...');
    const bPatchRes = await fetch(`${API_URL}/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({ name: 'Hacked name' })
    });
    if (bPatchRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${bPatchRes.status}`);
    }

    console.log('CRITICAL: Agency B attempting to redeploy Agency A\'s agent...');
    const bDeployRes = await fetch(`${API_URL}/agents/${agentId}/deploy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    if (bDeployRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${bDeployRes.status}`);
    }

    console.log('\n--- ALL AGENT CONFIG & DEPLOYMENT TESTS PASSED SUCCESSFULLY! ---');
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
