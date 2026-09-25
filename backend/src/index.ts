import bcrypt from 'bcryptjs';
import app from './app';
import { runMigrations } from './db/migrate';
import pool from './config/db';

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Run database migrations on startup
    await runMigrations();

    // Auto-bootstrap super admin from environment variables if configured (e.g. Render dashboard)
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const cleanEmail = process.env.ADMIN_EMAIL.trim().toLowerCase();
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      const existing = await pool.query('SELECT id, role FROM agencies WHERE email = $1', [cleanEmail]);

      if (!existing.rowCount || existing.rowCount === 0) {
        await pool.query(
          `INSERT INTO agencies (name, email, password_hash, role)
           VALUES ($1, $2, $3, 'super_admin')`,
          ['Platform Owner', cleanEmail, hash]
        );
        console.log(`[BOOTSTRAP] Super admin account ${cleanEmail} created.`);
      } else {
        await pool.query(
          "UPDATE agencies SET password_hash = $1, role = 'super_admin' WHERE email = $2",
          [hash, cleanEmail]
        );
        console.log(`[BOOTSTRAP] Super admin account ${cleanEmail} synced with environment credentials.`);
      }
    }

    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        try {
          await pool.end();
          console.log('Database connection pool closed.');
          process.exit(0);
        } catch (err) {
          console.error('Error during database pool shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
