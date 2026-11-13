import { Router } from 'express';
import { db } from '../db';
import { requireAuth, requirePermission, type AuthedRequest } from '../middleware';
import { hasPermission } from '../../src/shared/permissions';

export const reportsRouter = Router();

reportsRouter.get('/reports/:type', requireAuth, requirePermission('reports', 'view'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const type = req.params.type;
  const from = String(req.query.from ?? '').trim();
  const to = String(req.query.to ?? '').trim();
  const initiativeId = req.query.initiative_id ? Number(req.query.initiative_id) : null;

  const checkAccess = (sec: Parameters<typeof hasPermission>[1]) =>
    hasPermission(user.permissions, sec, 'view', user.is_owner === 1);

  switch (type) {
    case 'beneficiaries': {
      if (!checkAccess('beneficiaries')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على بيانات المستفيدين.' });
        return;
      }
      const rows = db.prepare('SELECT * FROM beneficiaries WHERE is_archived = 0 ORDER BY id DESC').all();
      res.json({ rows });
      return;
    }

    case 'beneficiaries_no_aid': {
      if (!checkAccess('beneficiaries')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على بيانات المستفيدين.' });
        return;
      }
      const rows = db
        .prepare(`
          SELECT b.* FROM beneficiaries b
          WHERE b.is_archived = 0
            AND NOT EXISTS (SELECT 1 FROM aids a WHERE a.beneficiary_id = b.id AND a.status IN ('معتمدة', 'مسلمة'))
          ORDER BY b.id DESC
        `)
        .all();
      res.json({ rows });
      return;
    }

    case 'initiative_beneficiaries': {
      if (!checkAccess('initiatives')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على مستفيدي المبادرات.' });
        return;
      }
      const rows = initiativeId
        ? db
            .prepare(`
              SELECT ib.*, i.name as initiative_name, i.code as initiative_code
              FROM initiative_beneficiaries ib
              JOIN initiatives i ON i.id = ib.initiative_id
              WHERE ib.initiative_id = ?
              ORDER BY ib.id DESC
            `)
            .all(initiativeId)
        : db
            .prepare(`
              SELECT ib.*, i.name as initiative_name, i.code as initiative_code
              FROM initiative_beneficiaries ib
              JOIN initiatives i ON i.id = ib.initiative_id
              ORDER BY ib.id DESC
            `)
            .all();
      res.json({ rows });
      return;
    }

    case 'beneficiary_files': {
      if (!checkAccess('beneficiary_files')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على الملفات الجماعية.' });
        return;
      }
      const rows = db
        .prepare(`
          SELECT f.*, (SELECT COUNT(*) FROM beneficiary_file_members m WHERE m.file_id = f.id) as members_count
          FROM beneficiary_files f
          ORDER BY f.id DESC
        `)
        .all();
      res.json({ rows });
      return;
    }

    case 'aids': {
      if (!checkAccess('aids')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على المساعدات.' });
        return;
      }
      let sql = `
        SELECT a.*, COALESCE(NULLIF(b.wife_name, ''), b.husband_name) as beneficiary_name,
               b.code as beneficiary_code, i.name as initiative_name
        FROM aids a
        JOIN beneficiaries b ON b.id = a.beneficiary_id
        LEFT JOIN initiatives i ON i.id = a.initiative_id
        WHERE 1=1
      `;
      const args: (string | number)[] = [];
      if (from) {
        sql += ' AND a.aid_date >= ?';
        args.push(from);
      }
      if (to) {
        sql += ' AND a.aid_date <= ?';
        args.push(to);
      }
      if (initiativeId) {
        sql += ' AND a.initiative_id = ?';
        args.push(initiativeId);
      }
      sql += ' ORDER BY a.id DESC';
      res.json({ rows: db.prepare(sql).all(...args) });
      return;
    }

    case 'cancelled_rejected_aids': {
      if (!checkAccess('aids')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على المساعدات.' });
        return;
      }
      const rows = db
        .prepare(`
          SELECT a.*, COALESCE(NULLIF(b.wife_name, ''), b.husband_name) as beneficiary_name, b.code as beneficiary_code
          FROM aids a
          JOIN beneficiaries b ON b.id = a.beneficiary_id
          WHERE a.status IN ('ملغاة', 'مرفوضة')
          ORDER BY a.id DESC
        `)
        .all();
      res.json({ rows });
      return;
    }

    case 'donations_expenses': {
      if (!checkAccess('donations')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على التبرعات والمصروفات.' });
        return;
      }
      const donations = db
        .prepare(`
          SELECT 'تبرع' as entry_kind, d.code, d.donor_name as title_or_party, d.donation_type as sub_type,
                 d.amount, d.donation_date as entry_date, d.scope, d.status, COALESCE(i.name, 'عام') as initiative_name
          FROM donations d LEFT JOIN initiatives i ON i.id = d.initiative_id
          ORDER BY d.id DESC
        `)
        .all();
      const expenses = db
        .prepare(`
          SELECT 'مصروف' as entry_kind, e.code, e.title as title_or_party, e.category as sub_type,
                 e.amount, e.expense_date as entry_date, 'صرف' as scope, e.status, COALESCE(i.name, 'عام') as initiative_name
          FROM expenses e LEFT JOIN initiatives i ON i.id = e.initiative_id
          ORDER BY e.id DESC
        `)
        .all();
      res.json({ rows: [...donations, ...expenses] });
      return;
    }

    case 'inventory_movements': {
      if (!checkAccess('inventory')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على المخازن.' });
        return;
      }
      const rows = db
        .prepare(`
          SELECT m.*, i.name as item_name, i.unit, w.name as warehouse_name
          FROM inventory_movements m
          JOIN inventory_items i ON i.id = m.item_id
          JOIN warehouses w ON w.id = i.warehouse_id
          ORDER BY m.id DESC LIMIT 300
        `)
        .all();
      res.json({ rows });
      return;
    }

    case 'staff': {
      if (!checkAccess('employees') && !checkAccess('volunteers')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على الموظفين والمتطوعين.' });
        return;
      }
      const rows = db.prepare('SELECT * FROM staff_persons ORDER BY id DESC').all();
      res.json({ rows });
      return;
    }

    case 'attendance': {
      if (!checkAccess('attendance')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على الحضور والانصراف.' });
        return;
      }
      const rows = db
        .prepare(`
          SELECT a.*, s.full_name as person_name, s.code as person_code, s.job_title
          FROM attendance a
          JOIN staff_persons s ON s.id = a.person_id
          ORDER BY a.id DESC LIMIT 300
        `)
        .all();
      res.json({ rows });
      return;
    }

    case 'partners': {
      if (!checkAccess('partners')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على الشراكات.' });
        return;
      }
      const rows = db
        .prepare(`
          SELECT p.*, i.name as initiative_name,
            (SELECT COUNT(*) FROM partner_beneficiaries pb WHERE pb.partner_id = p.id) as beneficiaries_count
          FROM partners p
          LEFT JOIN initiatives i ON i.id = p.initiative_id
          ORDER BY p.id DESC
        `)
        .all();
      res.json({ rows });
      return;
    }

    case 'supplies': {
      if (!checkAccess('suppliers')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على الموردين.' });
        return;
      }
      const rows = db
        .prepare(`
          SELECT s.*, sup.name as supplier_name, w.name as warehouse_name, i.name as item_name
          FROM supplies s
          JOIN suppliers sup ON sup.id = s.supplier_id
          JOIN warehouses w ON w.id = s.warehouse_id
          JOIN inventory_items i ON i.id = s.item_id
          ORDER BY s.id DESC
        `)
        .all();
      res.json({ rows });
      return;
    }

    case 'user_operations': {
      if (!checkAccess('audit')) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على سجل عمليات المستخدمين.' });
        return;
      }
      const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300').all();
      res.json({ rows });
      return;
    }

    default:
      res.status(404).json({ error: 'نوع التقرير غير معروف.' });
  }
});
