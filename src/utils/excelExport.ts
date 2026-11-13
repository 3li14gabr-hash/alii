import * as XLSX from 'xlsx';
import {
  AID_BENEFICIARIES_EXCEL_HEADERS,
  beneficiaryTo13Columns,
  parseAidBeneficiariesRows,
  type ExcelImportPreviewResult,
} from '../shared/excelSchema';
import type { AssociationSettings, BeneficiaryRecord } from '../shared/types';

export function exportAidBeneficiariesExcel(beneficiaries: BeneficiaryRecord[], filename = 'مستفيدي_المساعدات.xlsx') {
  // Strictly 13 columns in exact mandated order, no extra columns (no code, no date, no initiative)
  const aoa: (string | number)[][] = [
    [...AID_BENEFICIARIES_EXCEL_HEADERS],
    ...beneficiaries.map((b) => beneficiaryTo13Columns(b)),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 24 }, // اسم الزوجة
    { wch: 18 }, // الرقم القومي
    { wch: 16 }, // المهنة
    { wch: 24 }, // اسم الزوج
    { wch: 18 }, // الرقم القومي
    { wch: 16 }, // المهنة
    { wch: 15 }, // رقم هاتف أول
    { wch: 15 }, // رقم هاتف ثاني
    { wch: 28 }, // العنوان
    { wch: 12 }, // عدد الأفراد
    { wch: 26 }, // وصف المنزل
    { wch: 26 }, // ملاحظات
    { wch: 16 }, // استحقاق الحالة
  ];
  ws['!views'] = [{ rightToLeft: true }];

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'مستفيدي المساعدات');
  XLSX.writeFile(wb, filename);
}

export function downloadAidBeneficiariesTemplate() {
  const aoa: (string | number)[][] = [
    [...AID_BENEFICIARIES_EXCEL_HEADERS],
    [
      'مثال: فاطمة أحمد علي',
      '29001012700111',
      'ربة منزل',
      'مثال: محمد حسن علي',
      '28505052700222',
      'عامل',
      '01001112233',
      '01112223344',
      'المراشدة - نجع الشيخ',
      5,
      'منزل دور أرضي',
      'احذف صف المثال قبل الاستيراد أو عدّله — استحقاق الحالة يقبل فقط A أو B أو C',
      'A',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 16 },
    { wch: 15 }, { wch: 15 }, { wch: 28 }, { wch: 12 }, { wch: 26 }, { wch: 34 }, { wch: 16 },
  ];
  // Excel Data Validation for column M (index 12: استحقاق الحالة) accepting only A, B, C
  (ws as Record<string, unknown>)['!dataValidation'] = [
    {
      sqref: 'M2:M2000',
      type: 'list',
      allowBlank: false,
      formula1: '"A,B,C"',
      showErrorMessage: true,
      errorTitle: 'قيمة غير صالحة',
      error: 'خانة استحقاق الحالة تقبل فقط: A أو B أو C',
    },
  ];
  ws['!views'] = [{ rightToLeft: true }];

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'قالب مستفيدي المساعدات');
  XLSX.writeFile(wb, 'قالب_استيراد_مستفيدي_المساعدات_13_عمود.xlsx');
}

export async function parseAidBeneficiariesExcelFile(
  file: File,
  existingBeneficiaries: BeneficiaryRecord[]
): Promise<ExcelImportPreviewResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' });

  const existingNids = new Set<string>();
  const existingPhones = new Set<string>();
  for (const b of existingBeneficiaries) {
    if (b.wife_national_id) existingNids.add(b.wife_national_id);
    if (b.husband_national_id) existingNids.add(b.husband_national_id);
    if (b.phone1) existingPhones.add(b.phone1);
  }

  return parseAidBeneficiariesRows(matrix, existingNids, existingPhones);
}

export function exportGenericExcel(
  headers: string[],
  rows: (string | number)[][],
  sheetName: string,
  filename: string
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!views'] = [{ rightToLeft: true }];
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export async function parseGenericExcelFile(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' });
}

/**
 * Generates a clean Arabic RTL printable / PDF-ready document via browser print frame
 * (zero window.open popup blocking; works seamlessly inside iframes!).
 */
export function printArabicReport(params: {
  title: string;
  subtitle?: string;
  association: AssociationSettings | null;
  headers: string[];
  rows: (string | number)[][];
  footerNote?: string;
}) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const logoHtml = params.association?.logo_url
    ? `<img src="${params.association.logo_url}" style="height:64px;width:64px;object-fit:contain;border-radius:8px;" />`
    : '';

  const ths = params.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const trs = params.rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(String(c ?? ''))}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!doctype html>
  <html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(params.title)}</title>
    <style>
      body { font-family: 'Cairo', 'Tajawal', Tahoma, Arial, sans-serif; direction: rtl; color: #0f172a; margin: 18px; }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d5c3e; padding-bottom: 12px; margin-bottom: 16px; }
      .assoc { display: flex; align-items: center; gap: 12px; }
      .assoc h1 { margin: 0; font-size: 18px; color: #0d5c3e; }
      .assoc p { margin: 2px 0 0; font-size: 12px; color: #475569; }
      .report-title { text-align: center; margin: 10px 0 14px; }
      .report-title h2 { margin: 0; font-size: 16px; color: #0f172a; }
      .report-title p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #0d5c3e; color: #ffffff; padding: 8px 6px; text-align: right; border: 1px solid #0d5c3e; }
      td { padding: 6px; border: 1px solid #cbd5e1; vertical-align: top; }
      tr:nth-child(even) td { background: #f8fafc; }
      .footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 11px; color: #475569; }
      @page { size: A4 landscape; margin: 12mm; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="assoc">
        ${logoHtml}
        <div>
          <h1>${escapeHtml(params.association?.name || 'جمعية الخير للتنمية الشاملة بالمراشدة')}</h1>
          <p>${escapeHtml(params.association?.address || '')} · هاتف: ${escapeHtml(params.association?.phone1 || '')}</p>
        </div>
      </div>
      <div style="text-align:left;font-size:11px;color:#475569;">
        <div>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
        <div>عدد السجلات: ${params.rows.length}</div>
      </div>
    </div>
    <div class="report-title">
      <h2>${escapeHtml(params.title)}</h2>
      ${params.subtitle ? `<p>${escapeHtml(params.subtitle)}</p>` : ''}
    </div>
    <table>
      <thead><tr>${ths}</tr></thead>
      <tbody>${trs || `<tr><td colspan="${params.headers.length}" style="text-align:center;">لا توجد بيانات للعرض</td></tr>`}</tbody>
    </table>
    <div class="footer">
      <span>${escapeHtml(params.footerNote || 'صادر من نظام خيرنا — جمعية الخير للتنمية الشاملة بالمراشدة')}</span>
      <span>${escapeHtml(params.association?.registration_no || '')}</span>
    </div>
  </body>
  </html>`;

  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      iframe.remove();
    }, 1500);
  }, 350);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
