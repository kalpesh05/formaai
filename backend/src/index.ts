import app from './app';
import { runMigrations } from './db/migrate';
import pool from './config/db';

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Run database migrations on startup
    await runMigrations();

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
