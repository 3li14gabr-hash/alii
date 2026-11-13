import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, ClipboardCheck, FileSpreadsheet, Plus, Printer, Trash2 } from 'lucide-react';
import type {
  AssociationSettings,
  InventoryItemRecord,
  InventoryMovementRecord,
  UserRecord,
  WarehouseRecord,
} from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest, formatDateArabic } from '../utils/api';
import { exportGenericExcel, printArabicReport } from '../utils/excelExport';
import { LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

interface StocktakeRow {
  id: number;
  item_name: string;
  warehouse_name: string;
  unit: string;
  recorded_qty: number;
  actual_qty: number;
  variance: number;
  reason: string;
  responsible_name: string;
  created_at: string;
}

export function InventoryView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'inventory', 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, 'inventory', 'edit', user.is_owner === 1);
  const canDelete = hasPermission(user.permissions, 'inventory', 'delete_single', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'inventory', 'print', user.is_owner === 1);
  const canExport = hasPermission(user.permissions, 'inventory', 'export_excel', user.is_owner === 1);

  const [tab, setTab] = useState<'items' | 'movements' | 'stocktakes' | 'warehouses'>('items');
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [movements, setMovements] = useState<InventoryMovementRecord[]>([]);
  const [stocktakes, setStocktakes] = useState<StocktakeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [itemModal, setItemModal] = useState(false);
  const [whModal, setWhModal] = useState(false);
  const [movModal, setMovModal] = useState(false);
  const [stocktakeModal, setStocktakeModal] = useState(false);

  const [itemForm, setItemForm] = useState({ warehouse_id: '', name: '', unit: 'كرتونة', quantity: 0, min_quantity: 10, category: 'مواد غذائية' });
  const [whForm, setWhForm] = useState({ name: '', location: '', manager_name: '', notes: '' });
  const [movForm, setMovForm] = useState({ item_id: '', movement_type: 'وارد', quantity: 1, target_warehouse_id: '', reason: '' });
  const [stForm, setStForm] = useState({ item_id: '', actual_qty: 0, reason: '', responsible_name: user.full_name });

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        warehouses: WarehouseRecord[];
        items: InventoryItemRecord[];
        movements: InventoryMovementRecord[];
        stocktakes: StocktakeRow[];
      }>('/api/inventory');
      setWarehouses(res.warehouses);
      setItems(res.items);
      setMovements(res.movements);
      setStocktakes(res.stocktakes);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل المخازن.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const lowStockCount = items.filter((i) => i.quantity <= i.min_quantity).length;

  return (
    <div>
      <PageHeader
        title="إدارة المخازن والجرد"
        subtitle="إدارة المخازن والأصناف والوارد والمنصرف والتحويلات وتنبيهات الحد الأدنى والجرد الفعلي"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                onClick={() =>
                  printArabicReport({
                    title: 'تقرير أرصدة المخازن والأصناف',
                    association,
                    headers: ['الكود', 'الصنف', 'المخزن', 'الوحدة', 'الرصيد الحالي', 'الحد الأدنى'],
                    rows: items.map((i) => [i.code, i.name, i.warehouse_name || '', i.unit, i.quantity, i.min_quantity]),
                  })
                }
                className="px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الأرصدة</span>
              </button>
            )}
            {canExport && (
              <button
                type="button"
                onClick={() =>
                  exportGenericExcel(
                    ['الكود', 'الصنف', 'المخزن', 'الوحدة', 'الرصيد', 'الحد الأدنى', 'التصنيف'],
                    items.map((i) => [i.code, i.name, i.warehouse_name || '', i.unit, i.quantity, i.min_quantity, i.category]),
                    'المخزون',
                    'أرصدة_المخازن.xlsx'
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
                    setMovForm({ item_id: items[0]?.id ? String(items[0].id) : '', movement_type: 'وارد', quantity: 1, target_warehouse_id: '', reason: '' });
                    setMovModal(true);
                  }}
                  className="px-3 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>حركة مخزون</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemForm({ warehouse_id: warehouses[0]?.id ? String(warehouses[0].id) : '', name: '', unit: 'كرتونة', quantity: 0, min_quantity: 10, category: 'مواد غذائية' });
                    setItemModal(true);
                  }}
                  className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة صنف</span>
                </button>
              </>
            )}
          </>
        }
      />

      {lowStockCount > 0 && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2.5 text-xs font-semibold text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>يوجد ({lowStockCount}) صنف وصل إلى الحد الأدنى أو أقل ويحتاج إلى إعادة توريد.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex p-1 bg-slate-200/70 rounded-lg">
          {[
            { key: 'items', label: `الأصناف (${items.length})` },
            { key: 'movements', label: `حركات المخزون (${movements.length})` },
            { key: 'stocktakes', label: `سجل الجرد (${stocktakes.length})` },
            { key: 'warehouses', label: `المخازن (${warehouses.length})` },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-md ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {canEdit && tab === 'stocktakes' && (
            <button
              type="button"
              onClick={() => {
                setStForm({ item_id: items[0]?.id ? String(items[0].id) : '', actual_qty: items[0]?.quantity || 0, reason: '', responsible_name: user.full_name });
                setStocktakeModal(true);
              }}
              className="px-3 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>إجراء جرد جديد</span>
            </button>
          )}
          {canCreate && tab === 'warehouses' && (
            <button
              type="button"
              onClick={() => setWhModal(true)}
              className="px-3 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مخزن</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : tab === 'items' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="p-3">الكود</th>
                  <th className="p-3">اسم الصنف</th>
                  <th className="p-3">المخزن</th>
                  <th className="p-3">الرصيد المتاح</th>
                  <th className="p-3">الحد الأدنى</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((i) => {
                  const low = i.quantity <= i.min_quantity;
                  return (
                    <tr key={i.id} className={low ? 'bg-amber-50/40' : ''}>
                      <td className="p-3 font-mono text-xs font-bold text-[#0d5c3e]">{i.code}</td>
                      <td className="p-3 font-semibold">{i.name}</td>
                      <td className="p-3 text-xs text-slate-600">{i.warehouse_name}</td>
                      <td className="p-3 font-bold tabular-nums">
                        {i.quantity} {i.unit}
                      </td>
                      <td className="p-3 tabular-nums text-xs text-slate-500">
                        {i.min_quantity} {i.unit}
                      </td>
                      <td className="p-3">
                        <StatusText status={low ? 'منخفض' : 'نشط'} />
                      </td>
                      <td className="p-3">
                        {canDelete && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/inventory/items/${i.id}`, { method: 'DELETE' });
                              onToast('success', 'تم حذف الصنف.');
                              loadAll();
                            }}
                            className="p-1.5 border border-red-200 text-red-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'movements' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="p-3">النوع</th>
                  <th className="p-3">الصنف</th>
                  <th className="p-3">المخزن</th>
                  <th className="p-3">الكمية</th>
                  <th className="p-3">الرصيد بعد الحركة</th>
                  <th className="p-3">السبب / المرجع</th>
                  <th className="p-3">المنفذ</th>
                  <th className="p-3">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="p-3">
                      <StatusText status={m.movement_type} />
                    </td>
                    <td className="p-3 font-semibold">{m.item_name}</td>
                    <td className="p-3 text-slate-600">{m.warehouse_name}</td>
                    <td className="p-3 font-bold tabular-nums">{m.quantity}</td>
                    <td className="p-3 tabular-nums">{m.balance_after}</td>
                    <td className="p-3 text-slate-700">{m.reason}</td>
                    <td className="p-3">{m.created_by_name}</td>
                    <td className="p-3 tabular-nums text-slate-500">{formatDateArabic(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'stocktakes' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3">الصنف</th>
                  <th className="p-3">المخزن</th>
                  <th className="p-3">الرصيد المسجل</th>
                  <th className="p-3">الرصيد الفعلي</th>
                  <th className="p-3">الفرق</th>
                  <th className="p-3">السبب</th>
                  <th className="p-3">المسؤول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stocktakes.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 font-semibold">{s.item_name}</td>
                    <td className="p-3">{s.warehouse_name}</td>
                    <td className="p-3 tabular-nums">{s.recorded_qty} {s.unit}</td>
                    <td className="p-3 tabular-nums font-bold">{s.actual_qty} {s.unit}</td>
                    <td className={`p-3 tabular-nums font-bold ${s.variance === 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {s.variance > 0 ? `+${s.variance}` : s.variance}
                    </td>
                    <td className="p-3">{s.reason}</td>
                    <td className="p-3">{s.responsible_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {warehouses.map((w) => (
            <div key={w.id} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-900">{w.name}</h3>
                <p className="text-xs text-slate-600 mt-1">الموقع: {w.location || '—'}</p>
                <p className="text-xs text-slate-600">أمين المخزن: {w.manager_name || '—'}</p>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiRequest(`/api/warehouses/${w.id}`, { method: 'DELETE' });
                      loadAll();
                    } catch (err) {
                      onToast('error', err instanceof Error ? err.message : 'تعذر حذف المخزن.');
                    }
                  }}
                  className="p-1.5 border border-red-200 text-red-600 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Item Modal */}
      <Modal open={itemModal} onClose={() => setItemModal(false)} title="إضافة صنف مخزني">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await apiRequest<{ message: string }>('/api/inventory/items', {
                method: 'POST',
                body: JSON.stringify({ ...itemForm, warehouse_id: Number(itemForm.warehouse_id) }),
              });
              onToast('success', res.message);
              setItemModal(false);
              loadAll();
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل إضافة الصنف.');
            }
          }}
          className="grid grid-cols-2 gap-3 text-sm"
        >
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">المخزن *</label>
            <select
              required
              value={itemForm.warehouse_id}
              onChange={(e) => setItemForm({ ...itemForm, warehouse_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الصنف *</label>
            <input
              type="text"
              required
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الوحدة</label>
            <input type="text" value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الكمية الافتتاحية</label>
            <input type="number" min={0} value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الحد الأدنى للتنبيه</label>
            <input type="number" min={0} value={itemForm.min_quantity} onChange={(e) => setItemForm({ ...itemForm, min_quantity: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">التصنيف</label>
            <input type="text" value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setItemModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">حفظ الصنف</button>
          </div>
        </form>
      </Modal>

      {/* Movement Modal */}
      <Modal open={movModal} onClose={() => setMovModal(false)} title="تسجيل حركة مخزون">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await apiRequest<{ message: string }>('/api/inventory/movements', {
                method: 'POST',
                body: JSON.stringify({
                  ...movForm,
                  item_id: Number(movForm.item_id),
                  target_warehouse_id: movForm.target_warehouse_id ? Number(movForm.target_warehouse_id) : null,
                }),
              });
              onToast('success', res.message);
              setMovModal(false);
              loadAll();
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل تسجيل الحركة.');
            }
          }}
          className="space-y-3 text-sm"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الصنف *</label>
            <select required value={movForm.item_id} onChange={(e) => setMovForm({ ...movForm, item_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.warehouse_name}) — الرصيد: {i.quantity}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">نوع الحركة</label>
              <select value={movForm.movement_type} onChange={(e) => setMovForm({ ...movForm, movement_type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                <option value="وارد">وارد</option>
                <option value="منصرف">منصرف</option>
                <option value="مرتجع">مرتجع</option>
                <option value="تحويل">تحويل لمخزن آخر</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الكمية *</label>
              <input type="number" min={1} required value={movForm.quantity} onChange={(e) => setMovForm({ ...movForm, quantity: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
            </div>
          </div>
          {movForm.movement_type === 'تحويل' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المخزن المحول إليه</label>
              <select required value={movForm.target_warehouse_id} onChange={(e) => setMovForm({ ...movForm, target_warehouse_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                <option value="">اختر المخزن...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">السبب / البيان *</label>
            <input type="text" required value={movForm.reason} onChange={(e) => setMovForm({ ...movForm, reason: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setMovModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">تنفيذ الحركة</button>
          </div>
        </form>
      </Modal>

      {/* Stocktake Modal */}
      <Modal open={stocktakeModal} onClose={() => setStocktakeModal(false)} title="تسجيل جرد مخزني">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await apiRequest<{ message: string }>('/api/inventory/stocktakes', {
                method: 'POST',
                body: JSON.stringify({ ...stForm, item_id: Number(stForm.item_id) }),
              });
              onToast('success', res.message);
              setStocktakeModal(false);
              loadAll();
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل تسجيل الجرد.');
            }
          }}
          className="space-y-3 text-sm"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الصنف *</label>
            <select required value={stForm.item_id} onChange={(e) => setStForm({ ...stForm, item_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name} — الرصيد المسجل: {i.quantity}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الرصيد الفعلي بالجرد *</label>
            <input type="number" min={0} required value={stForm.actual_qty} onChange={(e) => setStForm({ ...stForm, actual_qty: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">سبب الفرق (إن وجد)</label>
            <input type="text" value={stForm.reason} onChange={(e) => setStForm({ ...stForm, reason: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">المسؤول عن الجرد</label>
            <input type="text" required value={stForm.responsible_name} onChange={(e) => setStForm({ ...stForm, responsible_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setStocktakeModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">اعتماد الجرد</button>
          </div>
        </form>
      </Modal>

      {/* Warehouse Modal */}
      <Modal open={whModal} onClose={() => setWhModal(false)} title="إضافة مخزن جديد">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await apiRequest<{ message: string }>('/api/warehouses', {
                method: 'POST',
                body: JSON.stringify(whForm),
              });
              onToast('success', res.message);
              setWhModal(false);
              setWhForm({ name: '', location: '', manager_name: '', notes: '' });
              loadAll();
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل إضافة المخزن.');
            }
          }}
          className="space-y-3 text-sm"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المخزن *</label>
            <input type="text" required value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الموقع</label>
            <input type="text" value={whForm.location} onChange={(e) => setWhForm({ ...whForm, location: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">أمين المخزن</label>
            <input type="text" value={whForm.manager_name} onChange={(e) => setWhForm({ ...whForm, manager_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setWhModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">حفظ المخزن</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
