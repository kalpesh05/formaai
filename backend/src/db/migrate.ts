import fs from 'fs';
import path from 'path';
import pool from '../config/db';

const schemaPath = path.join(__dirname, 'schema.sql');

export async function runMigrations() {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  let retries = 10;
  
  while (retries > 0) {
    try {
      // Test the database connection
      await pool.query('SELECT 1');
      console.log('Database connection established.');
      
      // Execute the schema SQL
      console.log('Running migrations from schema.sql...');
      await pool.query(schemaSql);
      console.log('Database migrations completed successfully.');
      return;
    } catch (err: any) {
      console.error(`Database connection or migration failed. Retries remaining: ${retries - 1}. Error:`, err.message);
      retries -= 1;
      if (retries === 0) {
        throw new Error(`Could not connect to database or run migrations: ${err.message}`);
      }
      // Wait 3 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migration worker finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration worker failed:', err);
      process.exit(1);
    });
}
