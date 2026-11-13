import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, DEFAULT_ROLE_TEMPLATES } from './permissions';
import {
  AID_BENEFICIARIES_EXCEL_HEADERS,
  beneficiaryTo13Columns,
  parseAidBeneficiariesRows,
  validateAidBeneficiariesHeaders,
} from './excelSchema';
import type { BeneficiaryRecord } from './types';

test('13-column Excel headers match exact mandated order and count', () => {
  assert.equal(AID_BENEFICIARIES_EXCEL_HEADERS.length, 13);
  assert.equal(AID_BENEFICIARIES_EXCEL_HEADERS[0], 'اسم الزوجة');
  assert.equal(AID_BENEFICIARIES_EXCEL_HEADERS[1], 'الرقم القومي');
  assert.equal(AID_BENEFICIARIES_EXCEL_HEADERS[2], 'المهنة');
  assert.equal(AID_BENEFICIARIES_EXCEL_HEADERS[3], 'اسم الزوج');
  assert.equal(AID_BENEFICIARIES_EXCEL_HEADERS[4], 'الرقم القومي');
  assert.equal(AID_BENEFICIARIES_EXCEL_HEADERS[5], 'المهنة');
  assert.equal(AID_BENEFICIARIES_EXCEL_HEADERS[12], 'استحقاق الحالة');
});

test('validateAidBeneficiariesHeaders rejects extra or missing columns', () => {
  const validRes = validateAidBeneficiariesHeaders([...AID_BENEFICIARIES_EXCEL_HEADERS]);
  assert.equal(validRes.valid, true);

  const extraCol = validateAidBeneficiariesHeaders([...AID_BENEFICIARIES_EXCEL_HEADERS, 'كود المستفيد']);
  assert.equal(extraCol.valid, false);
});

test('parseAidBeneficiariesRows handles duplicate header names by position, validates A/B/C, and catches duplicates', () => {
  const matrix = [
    [...AID_BENEFICIARIES_EXCEL_HEADERS],
    [
      'فاطمة علي',
      '29001012700111',
      'ربة منزل',
      'محمد حسن',
      '28505052700222',
      'عامل',
      '01001112233',
      '',
      'المراشدة - نجع الشيخ',
      5,
      'منزل طوب لبن',
      'أولوية قصوى',
      'A',
    ],
    [
      'سعاد أحمد',
      '29102022700333',
      'خياطة',
      'خالد محمود',
      '28803032700444',
      'نجار',
      '01009998877',
      '',
      'المراشدة',
      4,
      'منزل دور واحد',
      '',
      'D', // invalid eligibility
    ],
    [
      'مريم سعيد',
      '29001012700111', // duplicate wife national ID from row 1
      'لا تعمل',
      'عمر علي',
      '28401012700555',
      'مزارع',
      '01112223344',
      '',
      'المراشدة',
      3,
      'مبني',
      '',
      'B',
    ],
  ];

  const result = parseAidBeneficiariesRows(matrix, new Set(['29999999999999']), new Set());
  assert.equal(result.headerValid, true);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 2);

  const row = result.accepted[0];
  assert.equal(row.wife_name, 'فاطمة علي');
  assert.equal(row.wife_national_id, '29001012700111');
  assert.equal(row.wife_job, 'ربة منزل');
  assert.equal(row.husband_name, 'محمد حسن');
  assert.equal(row.husband_national_id, '28505052700222');
  assert.equal(row.husband_job, 'عامل');
  assert.equal(row.eligibility, 'A');
});

test('beneficiaryTo13Columns exports strictly 13 values without code or date', () => {
  const sample: BeneficiaryRecord = {
    id: 1,
    code: 'BEN-0001',
    wife_name: 'فاطمة',
    wife_national_id: '29001012700111',
    wife_job: 'ربة منزل',
    husband_name: 'محمد',
    husband_national_id: '28505052700222',
    husband_job: 'عامل',
    phone1: '01001112233',
    phone2: '',
    address: 'المراشدة',
    family_count: 5,
    house_description: 'طوب لبن',
    notes: 'ملاحظة',
    eligibility: 'A',
    is_archived: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
  const row = beneficiaryTo13Columns(sample);
  assert.equal(row.length, 13);
  assert.equal(row.includes('BEN-0001'), false);
  assert.equal(row[12], 'A');
});

test('RBAC permission evaluator enforces viewer vs owner vs aids_officer roles', () => {
  const viewer = DEFAULT_ROLE_TEMPLATES.find((r) => r.key === 'viewer')!;
  const aidsOfficer = DEFAULT_ROLE_TEMPLATES.find((r) => r.key === 'aids_officer')!;

  assert.equal(hasPermission(viewer.permissions, 'beneficiaries', 'view'), true);
  assert.equal(hasPermission(viewer.permissions, 'beneficiaries', 'create'), false);
  assert.equal(hasPermission(viewer.permissions, 'users', 'view'), false);
  assert.equal(hasPermission(viewer.permissions, 'audit', 'view'), false);

  assert.equal(hasPermission(aidsOfficer.permissions, 'aids', 'approve'), true);
  assert.equal(hasPermission(aidsOfficer.permissions, 'donations', 'create'), false);

  // Owner overrides all
  assert.equal(hasPermission({}, 'backup', 'delete_bulk', true), true);
});
