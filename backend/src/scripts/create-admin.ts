import bcrypt from 'bcryptjs';
import pool from '../config/db';

async function main() {
  const args = process.argv.slice(2);
  const email = args[0] || 'admin@formaai.com';
  const password = args[1] || 'Admin123!';
  const name = args[2] || 'Platform Owner';

  console.log(`\n🔑 Setting up Super Admin credentials for: ${email}...`);

  const hash = await bcrypt.hash(password, 10);
  const existing = await pool.query('SELECT id, role FROM agencies WHERE email = $1', [email]);

  if (existing.rowCount && existing.rowCount > 0) {
    await pool.query('UPDATE agencies SET password_hash = $1, role = \'super_admin\' WHERE email = $2', [hash, email]);
    console.log(`✅ Updated existing account (${email}) to 'super_admin' role with updated password.`);
  } else {
    await pool.query(
      `INSERT INTO agencies (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'super_admin')`,
      [name, email, hash]
    );
    console.log(`✅ Successfully created brand-new Super Admin account!`);
  }

  console.log(`\n📋 Your Admin Login Credentials:`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Portal:   http://localhost:5174/login\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to create admin user:', err.message);
  process.exit(1);
});
