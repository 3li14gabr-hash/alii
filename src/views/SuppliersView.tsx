import React, { useEffect, useState } from 'react';
import { Eye, FileSpreadsheet, PackagePlus, Plus, Printer, Trash2 } from 'lucide-react';
import type {
  AssociationSettings,
  InventoryItemRecord,
  SupplierRecord,
  SupplyRecord,
  UserRecord,
} from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest, formatCurrency } from '../utils/api';
import { exportGenericExcel, printArabicReport } from '../utils/excelExport';
import { EmptyState, LoadingState, Modal, PageHeader } from '../components/UiPrimitives';

export function SuppliersView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'suppliers', 'create', user.is_owner === 1);
  const canDelete = hasPermission(user.permissions, 'suppliers', 'delete_single', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'suppliers', 'print', user.is_owner === 1);
  const canExport = hasPermission(user.permissions, 'suppliers', 'export_excel', user.is_owner === 1);

  const [tab, setTab] = useState<'suppliers' | 'supplies'>('suppliers');
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplies, setSupplies] = useState<SupplyRecord[]>([]);
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [supModal, setSupModal] = useState(false);
  const [supplyModal, setSupplyModal] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  const [supForm, setSupForm] = useState({ name: '', category: 'مواد غذائية', phone: '', email: '', address: '', tax_no: '', notes: '' });
  const [supplyForm, setSupplyForm] = useState({
    supplier_id: '',
    item_id: '',
    quantity: 1,
    unit_price: 0,
    supply_date: new Date().toISOString().slice(0, 10),
    invoice_no: '',
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [res, invRes] = await Promise.all([
        apiRequest<{ suppliers: SupplierRecord[]; supplies: SupplyRecord[] }>('/api/suppliers'),
        apiRequest<{ items: InventoryItemRecord[] }>('/api/inventory').catch(() => ({ items: [] })),
      ]);
      setSuppliers(res.suppliers);
      setSupplies(res.supplies);
      setItems(invRes.items);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل الموردين.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div>
      <PageHeader
        title="إدارة الموردين والتوريدات"
        subtitle="تسجيل الموردين وفواتير المشتريات والتوريدات وإضافتها تلقائيًا إلى أرصدة المخازن"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                onClick={() =>
                  printArabicReport({
                    title: 'تقرير المشتريات والتوريدات',
                    association,
                    headers: ['المورد', 'الصنف', 'المخزن', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'التاريخ', 'الفاتورة'],
                    rows: supplies.map((s) => [
                      s.supplier_name || '',
                      s.item_name || '',
                      s.warehouse_name || '',
                      s.quantity,
                      s.unit_price,
                      s.total_price,
                      s.supply_date,
                      s.invoice_no,
                    ]),
                  })
                }
                className="px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة التقرير</span>
              </button>
            )}
            {canExport && (
              <button
                type="button"
                onClick={() =>
                  exportGenericExcel(
                    ['المورد', 'الصنف', 'المخزن', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'التاريخ', 'رقم الفاتورة'],
                    supplies.map((s) => [
                      s.supplier_name || '',
                      s.item_name || '',
                      s.warehouse_name || '',
                      s.quantity,
                      s.unit_price,
                      s.total_price,
                      s.supply_date,
                      s.invoice_no,
                    ]),
                    'التوريدات',
                    'تقرير_المشتريات_والتوريدات.xlsx'
                  )
                }
                className="px-3 py-2 border border-[#c6973f] bg-[#fbf6eb] text-[#7a5816] rounded-lg text-xs font-bold flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            )}
            {canCreate && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceFile(null);
                    setSupplyForm({
                      supplier_id: suppliers[0]?.id ? String(suppliers[0].id) : '',
                      item_id: items[0]?.id ? String(items[0].id) : '',
                      quantity: 1,
                      unit_price: 0,
                      supply_date: new Date().toISOString().slice(0, 10),
                      invoice_no: '',
                      notes: '',
                    });
                    setSupplyModal(true);
                  }}
                  className="px-3 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <PackagePlus className="w-4 h-4" />
                  <span>تسجيل توريد للمخزن</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSupModal(true)}
                  className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة مورد</span>
                </button>
              </>
            )}
          </>
        }
      />

      <div className="inline-flex p-1 bg-slate-200/70 rounded-lg mb-4">
        <button
          type="button"
          onClick={() => setTab('suppliers')}
          className={`px-4 py-1.5 text-xs font-bold rounded-md ${tab === 'suppliers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        >
          الموردون ({suppliers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('supplies')}
          className={`px-4 py-1.5 text-xs font-bold rounded-md ${tab === 'supplies' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        >
          سجل التوريدات والفواتير ({supplies.length})
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : tab === 'suppliers' ? (
        suppliers.length === 0 ? (
          <EmptyState title="لا يوجد موردون" description="أضف بيانات الموردين لربطهم بالمشتريات والمخازن." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suppliers.map((s) => (
              <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-start">
                <div>
                  <div className="text-xs font-semibold text-[#0d5c3e]">{s.category}</div>
                  <h3 className="font-bold text-slate-900 mt-0.5">{s.name}</h3>
                  <div className="text-xs text-slate-600 mt-1 font-mono">{s.phone}</div>
                  <div className="text-xs text-slate-500">{s.address}</div>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/suppliers/${s.id}`, { method: 'DELETE' });
                      loadData();
                    }}
                    className="p-1.5 border border-red-200 text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3">المورد</th>
                  <th className="p-3">الصنف والمخزن</th>
                  <th className="p-3">الكمية</th>
                  <th className="p-3">سعر الوحدة</th>
                  <th className="p-3">الإجمالي</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الفاتورة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplies.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 font-semibold">{s.supplier_name}</td>
                    <td className="p-3">
                      <div className="font-medium">{s.item_name}</div>
                      <div className="text-slate-500">{s.warehouse_name}</div>
                    </td>
                    <td className="p-3 font-bold tabular-nums">{s.quantity}</td>
                    <td className="p-3 tabular-nums">{formatCurrency(s.unit_price)}</td>
                    <td className="p-3 font-bold text-[#0d5c3e] tabular-nums">{formatCurrency(s.total_price)}</td>
                    <td className="p-3 tabular-nums">{s.supply_date}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{s.invoice_no || '—'}</span>
                        {s.invoice_url && (
                          <a href={s.invoice_url} target="_blank" rel="noreferrer" className="p-1 border border-slate-300 rounded">
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      <Modal open={supModal} onClose={() => setSupModal(false)} title="إضافة مورد جديد">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await apiRequest('/api/suppliers', { method: 'POST', body: JSON.stringify(supForm) });
            onToast('success', 'تمت إضافة المورد بنجاح.');
            setSupModal(false);
            setSupForm({ name: '', category: 'مواد غذائية', phone: '', email: '', address: '', tax_no: '', notes: '' });
            loadData();
          }}
          className="space-y-3 text-sm"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المورد *</label>
            <input type="text" required value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">النشاط</label>
              <input type="text" value={supForm.category} onChange={(e) => setSupForm({ ...supForm, category: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الهاتف</label>
              <input type="text" value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">العنوان</label>
            <input type="text" value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setSupModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">حفظ المورد</button>
          </div>
        </form>
      </Modal>

      {/* Add Supply Modal */}
      <Modal open={supplyModal} onClose={() => setSupplyModal(false)} title="تسجيل توريد وإضافته للمخزن">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData();
            Object.entries(supplyForm).forEach(([k, v]) => fd.append(k, String(v)));
            if (invoiceFile) fd.append('invoice', invoiceFile);
            const res = await apiRequest<{ message: string }>('/api/supplies', { method: 'POST', body: fd, isFormData: true });
            onToast('success', res.message);
            setSupplyModal(false);
            loadData();
          }}
          className="space-y-3 text-sm"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">المورد *</label>
            <select required value={supplyForm.supplier_id} onChange={(e) => setSupplyForm({ ...supplyForm, supplier_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الصنف المخزني *</label>
            <select required value={supplyForm.item_id} onChange={(e) => setSupplyForm({ ...supplyForm, item_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.warehouse_name})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الكمية *</label>
              <input type="number" min={1} required value={supplyForm.quantity} onChange={(e) => setSupplyForm({ ...supplyForm, quantity: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">سعر الوحدة *</label>
              <input type="number" min={0} required value={supplyForm.unit_price} onChange={(e) => setSupplyForm({ ...supplyForm, unit_price: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الفاتورة</label>
              <input type="text" value={supplyForm.invoice_no} onChange={(e) => setSupplyForm({ ...supplyForm, invoice_no: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">صورة الفاتورة</label>
            <input type="file" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setSupplyModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">تسجيل وإضافة للمخزن</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
