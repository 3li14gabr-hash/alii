import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import type { AssociationSettings, StaffPersonRecord } from '../shared/types';

export const ID_CARD_WIDTH = 1050;
export const ID_CARD_HEIGHT = 660;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ratio = Math.min(w / img.width, h / img.height);
  const drawW = img.width * ratio;
  const drawH = img.height * ratio;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ratio = Math.max(w / img.width, h / img.height);
  const drawW = img.width * ratio;
  const drawH = img.height * ratio;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

/**
 * Renders a deterministic, fixed-aspect-ratio (1050x660) Arabic RTL ID card to Canvas.
 * Preview, PNG, JPG, and PDF all originate from this exact full-card render so ZERO edge clipping occurs.
 */
export async function renderIdCardCanvas(
  person: StaffPersonRecord,
  association: AssociationSettings | null
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = ID_CARD_WIDTH;
  canvas.height = ID_CARD_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // 1. Crisp white base & safe margin outer frame
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ID_CARD_WIDTH, ID_CARD_HEIGHT);

  // Subtle geometric decorative background band
  ctx.fillStyle = '#f4f8f6';
  ctx.fillRect(20, 20, ID_CARD_WIDTH - 40, ID_CARD_HEIGHT - 40);

  // Outer emerald border with gold inner accent
  ctx.strokeStyle = '#0d5c3e';
  ctx.lineWidth = 6;
  drawRoundedRect(ctx, 20, 20, ID_CARD_WIDTH - 40, ID_CARD_HEIGHT - 40, 24);
  ctx.stroke();

  ctx.strokeStyle = '#c6973f';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 30, 30, ID_CARD_WIDTH - 60, ID_CARD_HEIGHT - 60, 18);
  ctx.stroke();

  // 2. Top Emerald Header Banner (inside safe frame)
  ctx.save();
  drawRoundedRect(ctx, 32, 32, ID_CARD_WIDTH - 64, 138, 16);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 32, ID_CARD_WIDTH, 170);
  grad.addColorStop(0, '#09442e');
  grad.addColorStop(1, '#0d5c3e');
  ctx.fillStyle = grad;
  ctx.fillRect(32, 32, ID_CARD_WIDTH - 64, 138);
  // Gold bottom stripe on header
  ctx.fillStyle = '#c6973f';
  ctx.fillRect(32, 162, ID_CARD_WIDTH - 64, 8);
  ctx.restore();

  // 3. Association Logo (Right side in RTL, aspect-ratio preserved inside white circle/card)
  const logoImg = await loadImage(association?.logo_url || '');
  ctx.save();
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, ID_CARD_WIDTH - 166, 46, 110, 110, 16);
  ctx.fill();
  ctx.strokeStyle = '#c6973f';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (logoImg) {
    ctx.clip();
    drawImageContain(ctx, logoImg, ID_CARD_WIDTH - 158, 54, 94, 94);
  } else {
    ctx.fillStyle = '#0d5c3e';
    ctx.font = 'bold 26px Cairo, Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('خيرنا', ID_CARD_WIDTH - 111, 110);
  }
  ctx.restore();

  // 4. Association Name & Card Classification in Header (RTL aligned)
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Cairo, Tahoma, sans-serif';
  const assocName = association?.name || 'جمعية الخير للتنمية الشاملة بالمراشدة';
  ctx.fillText(assocName, ID_CARD_WIDTH - 190, 92, 660);

  ctx.fillStyle = '#f5dea9';
  ctx.font = 'bold 21px Cairo, Tahoma, sans-serif';
  const cardBadge = person.person_type === 'volunteer' ? 'كارنيه متطوع معتمد' : 'بطاقة تعريف موظف رسمية';
  ctx.fillText(`${cardBadge} · ${association?.registration_no || 'المراشدة - قنا'}`, ID_CARD_WIDTH - 190, 134, 660);

  // 5. Person Portrait Frame (Right column in RTL)
  const photoX = ID_CARD_WIDTH - 290;
  const photoY = 205;
  const photoW = 225;
  const photoH = 270;

  ctx.save();
  ctx.fillStyle = '#e2e8f0';
  drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 16);
  ctx.fill();
  ctx.strokeStyle = '#c6973f';
  ctx.lineWidth = 4;
  ctx.stroke();

  const personImg = await loadImage(person.photo_url || '');
  if (personImg) {
    ctx.clip();
    drawImageCover(ctx, personImg, photoX, photoY, photoW, photoH);
  } else {
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 24px Cairo, Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('صورة شخصية', photoX + photoW / 2, photoY + photoH / 2);
  }
  ctx.restore();

  // 6. Membership Code Badge under portrait
  ctx.fillStyle = '#0d5c3e';
  drawRoundedRect(ctx, photoX, photoY + photoH + 16, photoW, 48, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px "IBM Plex Mono", monospace';
  ctx.fillText(person.code, photoX + photoW / 2, photoY + photoH + 49);

  // 7. Personal & Job Details (Middle-Left RTL area)
  const textRightX = photoX - 34;
  ctx.textAlign = 'right';

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 36px Cairo, Tahoma, sans-serif';
  ctx.fillText(person.full_name, textRightX, 245, 450);

  ctx.fillStyle = '#0d5c3e';
  ctx.font = 'bold 26px Cairo, Tahoma, sans-serif';
  ctx.fillText(person.job_title, textRightX, 292, 450);

  // Divider line
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(240, 316);
  ctx.lineTo(textRightX, 316);
  ctx.stroke();

  const details: [string, string][] = [
    ['الصفة:', person.person_type === 'volunteer' ? 'متطوع بالجمعية' : 'موظف بالجمعية'],
    ['المهام / القسم:', person.department_or_tasks || 'العمل التنموي والميداني'],
    ['الرقم القومي:', person.national_id || '—'],
    ['رقم الهاتف:', person.phone || '—'],
    ['تاريخ الانضمام:', person.hire_or_join_date || '—'],
    ['الحالة:', person.status || 'نشط'],
  ];

  let curY = 358;
  for (const [label, value] of details) {
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px Cairo, Tahoma, sans-serif';
    ctx.fillText(label, textRightX, curY);

    ctx.fillStyle = '#0f172a';
    ctx.font = '600 20px Tajawal, Cairo, sans-serif';
    ctx.fillText(value, textRightX - 150, curY, 320);
    curY += 40;
  }

  // 8. Real QR Code (Bottom Left)
  const qrPayload = JSON.stringify({
    org: association?.short_name || 'جمعية الخير بالمراشدة',
    code: person.code,
    name: person.full_name,
    role: person.job_title,
    status: person.status,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 170,
    margin: 1,
    color: { dark: '#09442e', light: '#ffffff' },
  });
  const qrImg = await loadImage(qrDataUrl);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, 56, 330, 168, 168, 12);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (qrImg) {
    ctx.drawImage(qrImg, 64, 338, 152, 152);
  }
  ctx.restore();

  ctx.fillStyle = '#475569';
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px Cairo, Tahoma, sans-serif';
  ctx.fillText('رمز التحقق السريع', 140, 520);

  // 9. Footer strip (safe inside inner margin)
  ctx.fillStyle = '#f1f5f9';
  drawRoundedRect(ctx, 44, ID_CARD_HEIGHT - 86, ID_CARD_WIDTH - 88, 44, 8);
  ctx.fill();

  ctx.fillStyle = '#334155';
  ctx.textAlign = 'right';
  ctx.font = '600 17px Tajawal, Cairo, sans-serif';
  ctx.fillText(
    `العنوان: ${association?.address || 'المراشدة - قنا'} · هاتف الجمعية: ${association?.phone1 || ''}`,
    ID_CARD_WIDTH - 62,
    ID_CARD_HEIGHT - 58,
    620
  );

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0d5c3e';
  ctx.font = 'bold 17px Cairo, Tahoma, sans-serif';
  ctx.fillText(`يعتمد / ${association?.chairman_name || 'رئيس مجلس الإدارة'}`, 62, ID_CARD_HEIGHT - 58, 300);

  return canvas;
}

export async function exportIdCardImage(
  person: StaffPersonRecord,
  association: AssociationSettings | null,
  format: 'png' | 'jpeg'
): Promise<{ blob: Blob; dataUrl: string; filename: string }> {
  const canvas = await renderIdCardCanvas(person, association);
  if (canvas.width !== ID_CARD_WIDTH || canvas.height !== ID_CARD_HEIGHT) {
    throw new Error('فشل التحقق من أبعاد الكارنيه النهائية.');
  }
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, 0.96);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('تعذر توليد ملف الصورة.'))),
      mime,
      0.96
    );
  });
  const ext = format === 'png' ? 'png' : 'jpg';
  const filename = `كارنيه_${person.code}_${person.full_name.replace(/\s+/g, '_')}.${ext}`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  return { blob, dataUrl, filename };
}

export async function exportIdCardsPdf(
  persons: StaffPersonRecord[],
  association: AssociationSettings | null
): Promise<string> {
  if (persons.length === 0) throw new Error('لم يتم اختيار أي كارنيه للتصدير.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Safe margins on A4 landscape (297 x 210 mm): center card at 240 x 150.8 mm (exact 1050:660 aspect ratio)
  const cardW = 240;
  const cardH = (cardW * ID_CARD_HEIGHT) / ID_CARD_WIDTH; // ~150.85 mm
  const x = (297 - cardW) / 2;
  const y = (210 - cardH) / 2;

  for (let i = 0; i < persons.length; i++) {
    if (i > 0) doc.addPage();
    const canvas = await renderIdCardCanvas(persons[i], association);
    const imgData = canvas.toDataURL('image/png', 1.0);
    doc.addImage(imgData, 'PNG', x, y, cardW, cardH);
  }

  const filename =
    persons.length === 1
      ? `كارنيه_${persons[0].code}.pdf`
      : `كارنيهات_مجمعة_${persons.length}.pdf`;
  doc.save(filename);
  return filename;
}

export async function printIdCardsBatch(
  persons: StaffPersonRecord[],
  association: AssociationSettings | null
): Promise<void> {
  const images: string[] = [];
  for (const p of persons) {
    const canvas = await renderIdCardCanvas(p, association);
    images.push(canvas.toDataURL('image/png', 1.0));
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cardsHtml = images
    .map(
      (src) => `
      <div style="page-break-inside:avoid;margin:10mm auto;text-align:center;">
        <img src="${src}" style="width:180mm;max-width:100%;height:auto;display:block;margin:0 auto;" />
      </div>`
    )
    .join('');

  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<!doctype html><html dir="rtl"><head><title>طباعة الكارنيهات</title><style>@page{margin:10mm;}</style></head><body>${cardsHtml}</body></html>`);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1500);
  }, 400);
}
