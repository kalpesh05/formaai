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

  // Count existing agencies - the first agency registered is automatically a super_admin / product owner
  const countResult = await query('SELECT COUNT(*)::int as count FROM agencies');
  const role = (countResult.rows[0]?.count === 0) ? 'super_admin' : 'agency_user';

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO agencies (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, white_label_name, white_label_logo_url, created_at`,
    [name, email, passwordHash, role]
  );

  const agency = result.rows[0];
  const token = jwt.sign({ agencyId: agency.id, role: agency.role }, JWT_SECRET, { expiresIn: '7d' });

  return res.status(201).json({ token, agency });
}));

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const result = await query(
    `SELECT id, name, email, password_hash, role, white_label_name, white_label_logo_url
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

  // Fallback role if previously NULL
  const role = agency.role || 'super_admin';
  const token = jwt.sign({ agencyId: agency.id, role }, JWT_SECRET, { expiresIn: '7d' });

  // Remove sensitive password hash from the response payload
  delete agency.password_hash;
  agency.role = role;

  return res.json({ token, agency });
}));

router.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { agencyId: string; role?: string };
    const result = await query(
      `SELECT id, name, email, role, white_label_name, white_label_logo_url, created_at
       FROM agencies WHERE id = $1`,
      [decoded.agencyId]
    );
    if (!result.rowCount || result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const agency = result.rows[0];
    if (!agency.role) agency.role = 'super_admin';
    return res.json({ agency });
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}));

router.post('/change-password', asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const token = authHeader.split(' ')[1];
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const decoded = jwt.verify(token, JWT_SECRET) as { agencyId: string };
  const userRes = await query('SELECT password_hash FROM agencies WHERE id = $1', [decoded.agencyId]);
  if (userRes.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const isMatch = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
  if (!isMatch) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE agencies SET password_hash = $1 WHERE id = $2', [newHash, decoded.agencyId]);

  return res.json({ message: 'Password updated successfully' });
}));

/**
 * POST /api/v1/auth/bootstrap-admin
 * Secure API endpoint to provision or reset Super Admin credentials on hosted environments (like Render free plan).
 */
router.post('/bootstrap-admin', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name = 'Platform Owner', secretKey } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Check if a super admin already exists
  const superAdminCount = await query("SELECT COUNT(*)::int as count FROM agencies WHERE role = 'super_admin'");
  const hasExistingSuperAdmin = (superAdminCount.rows[0]?.count || 0) > 0;

  // If super admins exist, require matching JWT_SECRET or ADMIN_SETUP_KEY to prevent unauthorized resets
  const expectedKey = process.env.ADMIN_SETUP_KEY || process.env.JWT_SECRET;
  if (hasExistingSuperAdmin && secretKey !== expectedKey) {
    return res.status(403).json({
      error: 'A Super Admin already exists. To update or reset, provide "secretKey" matching your JWT_SECRET.',
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 10);
  const existing = await query('SELECT id FROM agencies WHERE email = $1', [cleanEmail]);

  if (existing.rowCount && existing.rowCount > 0) {
    await query("UPDATE agencies SET password_hash = $1, role = 'super_admin' WHERE email = $2", [hash, cleanEmail]);
  } else {
    await query(
      `INSERT INTO agencies (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'super_admin')`,
      [name, cleanEmail, hash]
    );
  }

  return res.json({
    success: true,
    message: 'Super Admin credentials provisioned successfully!',
    email: cleanEmail,
    role: 'super_admin',
  });
}));

export default router;
