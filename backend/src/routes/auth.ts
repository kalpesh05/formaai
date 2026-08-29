import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'local_dev_forma_ai_jwt_secret_998877665544332211';

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

router.post('/signup', asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  // Check if email already exists
  const existing = await query('SELECT 1 FROM agencies WHERE email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO agencies (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, white_label_name, white_label_logo_url, created_at`,
    [name, email, passwordHash]
  );

  const agency = result.rows[0];
  const token = jwt.sign({ agencyId: agency.id }, JWT_SECRET, { expiresIn: '7d' });

  return res.status(201).json({ token, agency });
}));

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const result = await query(
    `SELECT id, name, email, password_hash, white_label_name, white_label_logo_url
     FROM agencies WHERE email = $1`,
    [email]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const agency = result.rows[0];
  const isMatch = await bcrypt.compare(password, agency.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ agencyId: agency.id }, JWT_SECRET, { expiresIn: '7d' });

  // Remove sensitive password hash from the response payload
  delete agency.password_hash;

  return res.json({ token, agency });
}));

export default router;
