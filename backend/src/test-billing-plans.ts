import app from './app';
import { runMigrations } from './db/migrate';
import pool from './config/db';
import jwt from 'jsonwebtoken';

const PORT = 5008;
const API_URL = `http://localhost:${PORT}/api/v1`;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_dev';

async function runBillingTests() {
  console.log('=== Starting Dynamic Billing & Gateway Sync Tests ===');

  await runMigrations();
  const server = app.listen(PORT);
  console.log(`Billing test server listening on port ${PORT}`);

  try {
    // Generate a Super Admin JWT for testing admin endpoints
    const adminToken = jwt.sign(
      {
        id: '00000000-0000-0000-0000-000000000001',
        agencyId: '00000000-0000-0000-0000-000000000001',
        email: 'admin@kromadesk.com',
        role: 'super_admin',
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 1. Test Public Plans endpoint
    console.log('\n[TEST 1] Fetching live public plans...');
    const plansRes = await fetch(`${API_URL}/plans`);
    if (!plansRes.ok) {
      throw new Error(`Failed to fetch public plans: ${plansRes.statusText}`);
    }
    const plansData = await plansRes.json() as any;
    console.log(`✓ Fetched ${plansData.plans.length} dynamic plans. Default top plan: ${plansData.plans[0]?.name}`);

    // 2. Test Admin Creating a New Custom Plan with Gateway Sync
    const testPlanId = `test_agency_scale_${Date.now().toString(36)}`;
    console.log(`\n[TEST 2] Creating dynamic plan '${testPlanId}' with Stripe/Razorpay sync...`);
    const createRes = await fetch(`${API_URL}/admin/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: testPlanId,
        name: 'Agency Scale Dynamic',
        tagline: 'High volume agency reseller tier',
        monthly_price: 149,
        yearly_monthly_price: 119,
        currency: 'usd',
        max_agents: 10,
        monthly_message_limit: 15000,
        max_forms: 15,
        max_ingest_urls: 200,
        white_label: true,
        custom_colors: true,
        payment_provider: 'both',
        rank: 3,
        highlight: true,
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create plan: ${await createRes.text()}`);
    }
    const createData = await createRes.json() as any;
    console.log(`✓ Plan created successfully with IDs:`);
    console.log(`  - Stripe Product ID: ${createData.plan.stripe_product_id}`);
    console.log(`  - Stripe Monthly Price: ${createData.plan.stripe_price_monthly_id}`);
    console.log(`  - Razorpay Monthly Plan: ${createData.plan.razorpay_plan_monthly_id}`);
    console.log(`  - Sync Logs:`, createData.sync_logs);

    // 3. Test Grandfathering: Updating Plan Price while protecting existing subscribers
    console.log(`\n[TEST 3] Updating plan price from $149 to $179 with Grandfathering ENABLED...`);
    const updateRes = await fetch(`${API_URL}/admin/plans/${testPlanId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        monthly_price: 179,
        yearly_monthly_price: 145,
        grandfather_existing: true,
      }),
    });

    if (!updateRes.ok) {
      throw new Error(`Failed to update plan: ${await updateRes.text()}`);
    }
    const updateData = await updateRes.json() as any;
    console.log(`✓ Plan price updated to $${updateData.plan.monthly_price}. Grandfathered: ${updateData.grandfathered}`);
    console.log(`  - New Stripe Monthly Price ID generated: ${updateData.plan.stripe_price_monthly_id}`);

    // 4. Test Subscriptions Listing
    console.log('\n[TEST 4] Retrieving subscriber records & grandfather status...');
    const subsRes = await fetch(`${API_URL}/admin/subscriptions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!subsRes.ok) {
      throw new Error(`Failed to fetch subscriptions: ${subsRes.statusText}`);
    }
    const subsData = await subsRes.json() as any;
    console.log(`✓ Successfully retrieved ${subsData.length} customer workspace subscriptions.`);

    // 5. Cleanup test plan
    console.log(`\n[TEST 5] Deactivating test plan '${testPlanId}'...`);
    await fetch(`${API_URL}/admin/plans/${testPlanId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log('✓ Test plan deactivated.');

    console.log('\n=== ALL DYNAMIC BILLING & GATEWAY TESTS PASSED! ===');
  } catch (err: any) {
    console.error('Billing test failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await pool.end();
  }
}

if (require.main === module) {
  runBillingTests();
}
