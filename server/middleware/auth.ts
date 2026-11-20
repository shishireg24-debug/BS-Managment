import { NextFunction, Request, Response } from 'express';
import { hashSessionToken } from '../crypto.ts';
import { db } from '../db.ts';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'operator';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const SESSION_COOKIE_NAME = 'bs_mgmt_session';

export function getSessionUser(req: Request): AuthUser | null {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token || typeof token !== 'string') return null;

  const hashed = hashSessionToken(token);
  const row = db
    .prepare(`
      SELECT u.id, u.name, u.email, u.role, u.is_active, s.expires_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `)
    .get(hashed) as
    | {
        id: number;
        name: string;
        email: string;
        role: AuthUser['role'];
        is_active: number;
        expires_at: string;
      }
    | undefined;

  if (!row || row.is_active !== 1) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(hashed);
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...allowedRoles: Array<AuthUser['role']>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }
    next();
  };
}
