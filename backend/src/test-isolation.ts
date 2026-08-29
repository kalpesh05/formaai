import app from './app';
import { runMigrations } from './db/migrate';
import pool from './config/db';

const PORT = 5001; // Run test server on a separate port
const API_URL = `http://localhost:${PORT}/api/v1`;

async function runTests() {
  console.log('--- Starting Multi-Tenant Isolation Tests ---');

  // Start the test server
  await runMigrations();
  const server = app.listen(PORT);
  console.log(`Test server listening on port ${PORT}`);

  try {
    // 1. Create Agency A
    console.log('Creating Agency A...');
    const signupARes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency A',
        email: 'agency.a@example.com',
        password: 'password123',
      })
    });
    
    if (!signupARes.ok) {
      throw new Error(`Failed to create Agency A: ${signupARes.statusText} (${await signupARes.text()})`);
    }
    
    const signupAData = await signupARes.json() as any;
    const tokenA = signupAData.token;
    const agencyAId = signupAData.agency.id;
    console.log(`Agency A created with ID: ${agencyAId}`);

    // 2. Create Agency B
    console.log('Creating Agency B...');
    const signupBRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agency B',
        email: 'agency.b@example.com',
        password: 'password123',
      })
    });
    
    if (!signupBRes.ok) {
      throw new Error(`Failed to create Agency B: ${signupBRes.statusText} (${await signupBRes.text()})`);
    }
    
    const signupBData = await signupBRes.json() as any;
    const tokenB = signupBData.token;
    const agencyBId = signupBData.agency.id;
    console.log(`Agency B created with ID: ${agencyBId}`);

    // 3. Agency A creates a Workspace
    console.log("Agency A creating 'Workspace A1'...");
    const wsA1Res = await fetch(`${API_URL}/workspaces`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ client_name: 'Workspace A1' })
    });
    
    if (!wsA1Res.ok) {
      throw new Error(`Failed to create Workspace A1: ${wsA1Res.statusText}`);
    }
    
    const wsA1Data = await wsA1Res.json() as any;
    const wsA1Id = wsA1Data.id;
    console.log(`Workspace A1 created with ID: ${wsA1Id}`);

    // 4. Agency B creates a Workspace
    console.log("Agency B creating 'Workspace B1'...");
    const wsB1Res = await fetch(`${API_URL}/workspaces`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({ client_name: 'Workspace B1' })
    });
    
    if (!wsB1Res.ok) {
      throw new Error(`Failed to create Workspace B1: ${wsB1Res.statusText}`);
    }
    
    const wsB1Data = await wsB1Res.json() as any;
    const wsB1Id = wsB1Data.id;
    console.log(`Workspace B1 created with ID: ${wsB1Id}`);

    // 5. Agency A lists workspaces
    console.log('Agency A listing workspaces...');
    const listARes = await fetch(`${API_URL}/workspaces`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` },
    });
    const workspacesA = await listARes.json() as any[];
    console.log('Workspaces for Agency A:', workspacesA.map((w: any) => w.client_name));
    if (workspacesA.length !== 1 || workspacesA[0].id !== wsA1Id) {
      throw new Error('Agency A should only see Workspace A1');
    }

    // 6. Agency B lists workspaces
    console.log('Agency B listing workspaces...');
    const listBRes = await fetch(`${API_URL}/workspaces`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` },
    });
    const workspacesB = await listBRes.json() as any[];
    console.log('Workspaces for Agency B:', workspacesB.map((w: any) => w.client_name));
    if (workspacesB.length !== 1 || workspacesB[0].id !== wsB1Id) {
      throw new Error('Agency B should only see Workspace B1');
    }

    // 7. CROSS-TENANT ISOLATION CHECK: Agency B tries to fetch Agency A's workspace
    console.log("CRITICAL TEST: Agency B attempting to fetch Agency A's 'Workspace A1'...");
    const fetchA1Attempt = await fetch(`${API_URL}/workspaces/${wsA1Id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` },
    });
    
    if (fetchA1Attempt.status === 403) {
      console.log('SUCCESS: Fetch was correctly blocked with 403 Forbidden.');
    } else {
      throw new Error(`SECURITY VIOLATION: Fetch returned status code ${fetchA1Attempt.status} instead of 403.`);
    }

    // 8. CROSS-TENANT ISOLATION CHECK: Agency B tries to delete Agency A's workspace
    console.log("CRITICAL TEST: Agency B attempting to delete Agency A's 'Workspace A1'...");
    const deleteA1Attempt = await fetch(`${API_URL}/workspaces/${wsA1Id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenB}` },
    });
    
    if (deleteA1Attempt.status === 403) {
      console.log('SUCCESS: Deletion was correctly blocked with 403 Forbidden.');
    } else {
      throw new Error(`SECURITY VIOLATION: Deletion returned status code ${deleteA1Attempt.status} instead of 403.`);
    }

    // Verify Workspace A1 still exists
    console.log("Verifying Workspace A1 is still accessible by Agency A...");
    const checkA1Res = await fetch(`${API_URL}/workspaces/${wsA1Id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` },
    });
    
    if (!checkA1Res.ok) {
      throw new Error(`Workspace A1 was deleted or corrupted during attack attempts: ${checkA1Res.statusText}`);
    }
    
    const checkA1Data = await checkA1Res.json() as any;
    if (checkA1Data.client_name !== 'Workspace A1') {
      throw new Error('Workspace A1 data mismatch!');
    }
    console.log("SUCCESS: Workspace A1 is intact and accessible to Agency A.");

    console.log('\n--- ALL MULTI-TENANT ISOLATION TESTS PASSED SUCCESSFULLY! ---');
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
