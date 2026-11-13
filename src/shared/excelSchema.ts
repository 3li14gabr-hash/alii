import type { BeneficiaryRecord } from './types';

/**
 * الأعمدة الثلاثة عشر الإلزامية لملف Excel الخاص بمستفيدي المساعدات
 * الترتيب ثابت وصارم (الفهارس 0 إلى 12) ولا يُضاف إليه أي عمود آخر.
 */
export const AID_BENEFICIARIES_EXCEL_HEADERS = [
  'اسم الزوجة',       // 0
  'الرقم القومي',     // 1 (الزوجة)
  'المهنة',           // 2 (الزوجة)
  'اسم الزوج',        // 3
  'الرقم القومي',     // 4 (الزوج)
  'المهنة',           // 5 (الزوج)
  'رقم هاتف أول',     // 6
  'رقم هاتف ثاني',    // 7
  'العنوان',          // 8
  'عدد الأفراد',      // 9
  'وصف المنزل',       // 10
  'ملاحظات',          // 11
  'استحقاق الحالة',   // 12 (A أو B أو C فقط)
] as const;

export const ALLOWED_ELIGIBILITIES = ['A', 'B', 'C'] as const;

const ARABIC_DIGITS_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

export function normalizeDigits(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .replace(/[٠-٩]/g, (ch) => ARABIC_DIGITS_MAP[ch] ?? ch);
}

export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function beneficiaryTo13Columns(b: BeneficiaryRecord): (string | number)[] {
  return [
    b.wife_name ?? '',
    b.wife_national_id ?? '',
    b.wife_job ?? '',
    b.husband_name ?? '',
    b.husband_national_id ?? '',
    b.husband_job ?? '',
    b.phone1 ?? '',
    b.phone2 ?? '',
    b.address ?? '',
    Number.isFinite(Number(b.family_count)) ? Number(b.family_count) : 1,
    b.house_description ?? '',
    b.notes ?? '',
    (['A', 'B', 'C'].includes(b.eligibility) ? b.eligibility : 'B'),
  ];
}

export interface ParsedAidBeneficiaryInput {
  rowIndex: number; // 1-based Excel row number
  wife_name: string;
  wife_national_id: string;
  wife_job: string;
  husband_name: string;
  husband_national_id: string;
  husband_job: string;
  phone1: string;
  phone2: string;
  address: string;
  family_count: number;
  house_description: string;
  notes: string;
  eligibility: 'A' | 'B' | 'C';
}

export interface RejectedImportRow {
  rowIndex: number;
  reason: string;
  rawSummary: string;
}

export interface ExcelImportPreviewResult {
  accepted: ParsedAidBeneficiaryInput[];
  rejected: RejectedImportRow[];
  headerValid: boolean;
  headerError?: string;
}

export function validateAidBeneficiariesHeaders(headerRow: unknown[]): { valid: boolean; error?: string } {
  if (!Array.isArray(headerRow) || headerRow.length !== 13) {
    return {
      valid: false,
      error: `يجب أن يحتوي الملف على 13 عمودًا بالضبط (الموجود: ${Array.isArray(headerRow) ? headerRow.length : 0} عمودًا).`,
    };
  }
  for (let i = 0; i < 13; i++) {
    const actual = cleanCell(headerRow[i]);
    const expected = AID_BENEFICIARIES_EXCEL_HEADERS[i];
    if (actual !== expected) {
      return {
        valid: false,
        error: `عدم تطابق العمود رقم ${i + 1}: المتوقع "${expected}" والموجود "${actual || 'فارغ'}".`,
      };
    }
  }
  return { valid: true };
}

export function parseAidBeneficiariesRows(
  matrix: unknown[][],
  existingNationalIds: Set<string>,
  existingPhones: Set<string>
): ExcelImportPreviewResult {
  if (!matrix || matrix.length === 0) {
    return {
      accepted: [],
      rejected: [],
      headerValid: false,
      headerError: 'الملف فارغ ولا يحتوي على صف العناوين.',
    };
  }

  const headerCheck = validateAidBeneficiariesHeaders(matrix[0]);
  if (!headerCheck.valid) {
    return {
      accepted: [],
      rejected: [],
      headerValid: false,
      headerError: headerCheck.error,
    };
  }

  const seenNationalIds = new Set<string>(existingNationalIds);
  const seenPhones = new Set<string>(existingPhones);
  const accepted: ParsedAidBeneficiaryInput[] = [];
  const rejected: RejectedImportRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    // Skip completely empty rows
    const hasAnyValue = row.some((cell) => cleanCell(cell) !== '');
    if (!hasAnyValue) continue;

    const rowIndex = i + 1;
    const wife_name = cleanCell(row[0]);
    const wife_national_id = normalizeDigits(row[1]);
    const wife_job = cleanCell(row[2]);
    const husband_name = cleanCell(row[3]);
    const husband_national_id = normalizeDigits(row[4]);
    const husband_job = cleanCell(row[5]);
    const phone1 = normalizeDigits(row[6]);
    const phone2 = normalizeDigits(row[7]);
    const address = cleanCell(row[8]);
    const familyCountRaw = normalizeDigits(row[9]);
    const family_count = familyCountRaw ? parseInt(familyCountRaw, 10) : 1;
    const house_description = cleanCell(row[10]);
    const notes = cleanCell(row[11]);
    const eligibilityRaw = cleanCell(row[12]).toUpperCase();

    const rawSummary = `${wife_name || husband_name || 'بدون اسم'} (${wife_national_id || husband_national_id || phone1 || '-'})`;

    if (!wife_name && !husband_name) {
      rejected.push({ rowIndex, reason: 'يجب إدخال اسم الزوجة أو اسم الزوج على الأقل.', rawSummary });
      continue;
    }

    if (!['A', 'B', 'C'].includes(eligibilityRaw)) {
      rejected.push({
        rowIndex,
        reason: `قيمة استحقاق الحالة غير صالحة "${cleanCell(row[12]) || 'فارغة'}" — المسموح فقط: A أو B أو C.`,
        rawSummary,
      });
      continue;
    }

    if (Number.isNaN(family_count) || family_count < 1) {
      rejected.push({ rowIndex, reason: 'عدد الأفراد يجب أن يكون رقمًا صحيحًا (1 فأكثر).', rawSummary });
      continue;
    }

    if (wife_national_id && seenNationalIds.has(wife_national_id)) {
      rejected.push({ rowIndex, reason: `الرقم القومي للزوجة (${wife_national_id}) مكرر أو مسجل مسبقًا.`, rawSummary });
      continue;
    }

    if (husband_national_id && seenNationalIds.has(husband_national_id)) {
      rejected.push({ rowIndex, reason: `الرقم القومي للزوج (${husband_national_id}) مكرر أو مسجل مسبقًا.`, rawSummary });
      continue;
    }

    if (wife_national_id && husband_national_id && wife_national_id === husband_national_id) {
      rejected.push({ rowIndex, reason: 'لا يمكن تطابق الرقم القومي للزوجة والزوج في نفس السجل.', rawSummary });
      continue;
    }

    if (phone1 && seenPhones.has(phone1)) {
      rejected.push({ rowIndex, reason: `رقم الهاتف الأول (${phone1}) مسجل مسبقًا لمستفيد آخر.`, rawSummary });
      continue;
    }

    if (wife_national_id) seenNationalIds.add(wife_national_id);
    if (husband_national_id) seenNationalIds.add(husband_national_id);
    if (phone1) seenPhones.add(phone1);

    accepted.push({
      rowIndex,
      wife_name,
      wife_national_id,
      wife_job,
      husband_name,
      husband_national_id,
      husband_job,
      phone1,
      phone2,
      address,
      family_count,
      house_description,
      notes,
      eligibility: eligibilityRaw as 'A' | 'B' | 'C',
    });
  }

  return { accepted, rejected, headerValid: true };
}
