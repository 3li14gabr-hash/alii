import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { db, UPLOADS_DIR, writeAuditLog } from './db';
import { hasPermission } from '../src/shared/permissions';
import type { PermissionAction, PermissionSection, PermissionsMatrix } from '../src/shared/types';

export interface AuthenticatedUser {
  id: number;
  username: string;
  full_name: string;
  phone: string;
  email: string;
  role_id: number;
  role_name: string;
  role_key: string;
  is_owner: number;
  is_active: number;
  permissions: PermissionsMatrix;
}

export interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
  authToken?: string;
}

export function resolveSessionUser(req: AuthedRequest): AuthenticatedUser | null {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (req.query.token as string | undefined) || '';

  if (!token) return null;

  const row = db
    .prepare(`
      SELECT u.id, u.username, u.full_name, u.phone, u.email, u.role_id, u.is_owner, u.is_active,
             r.name as role_name, r.key as role_key, r.permissions_json, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN roles r ON r.id = u.role_id
      WHERE s.token = ?
    `)
    .get(token) as
    | {
        id: number;
        username: string;
        full_name: string;
        phone: string;
        email: string;
        role_id: number;
        is_owner: number;
        is_active: number;
        role_name: string;
        role_key: string;
        permissions_json: string;
        expires_at: string;
      }
    | undefined;

  if (!row) return null;
  if (!row.is_active) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  let permissions: PermissionsMatrix = {};
  try {
    permissions = JSON.parse(row.permissions_json || '{}') as PermissionsMatrix;
  } catch {
    permissions = {};
  }

  req.authToken = token;
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    role_id: row.role_id,
    role_name: row.role_name,
    role_key: row.role_key,
    is_owner: row.is_owner,
    is_active: row.is_active,
    permissions,
  };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = resolveSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'يجب تسجيل الدخول أولاً للوصول إلى هذه الخدمة.' });
    return;
  }
  req.user = user;
  next();
}

export function requirePermission(section: PermissionSection, action: PermissionAction) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = req.user || resolveSessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
      return;
    }
    req.user = user;
    const allowed = hasPermission(user.permissions, section, action, user.is_owner === 1);
    if (!allowed) {
      writeAuditLog({
        userId: user.id,
        userName: user.full_name,
        actionType: `محاولة غير مصرح بها (${action})`,
        section,
        reason: 'رفض الصلاحية من الخادم',
        result: 'مرفوض (403)',
      });
      res.status(403).json({
        error: `ليس لديك صلاحية تنفيذ هذا الإجراء (${action}) في قسم (${section}).`,
      });
      return;
    }
    next();
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const safeExt = /^[.a-z0-9]{2,8}$/.test(ext) ? ext : '.bin';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
});

export function saveBase64ImageToUploads(dataUrl: string, prefix = 'capture'): string {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return '';
  }
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) return '';
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  const fileName = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const fullPath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(fullPath, buffer);
  if (!fs.existsSync(fullPath)) {
    throw new Error('فشل التحقق من حفظ الصورة على الخادم.');
  }
  return `/api/uploads/${fileName}`;
}
