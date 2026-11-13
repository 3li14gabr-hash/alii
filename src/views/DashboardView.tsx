import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  FolderKanban,
  HandHeart,
  Package,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import type { AssociationSettings, UserRecord } from '../shared/types';
import { apiRequest, formatCurrency, formatDateArabic } from '../utils/api';
import { LoadingState, PageHeader, StatusText } from '../components/UiPrimitives';
import type { NavTabKey } from '../components/Layout';

interface DashboardPayload {
  stats: {
    totalBeneficiaries: number;
    totalInitBeneficiaries: number;
    totalAidsDisbursed: number;
    pendingApprovals: number;
    pendingAidsCount: number;
    pendingDonationsCount: number;
    donationsCashApproved: number;
    donationsTotal: number;
    totalExpenses: number;
    netBalance: number;
    employeesCount: number;
    volunteersCount: number;
    activeInitiatives: number;
    lowStockCount: number;
  };
  lowStockItems: {
    id: number;
    name: string;
    warehouse_name: string;
    quantity: number;
    min_quantity: number;
    unit: string;
  }[];
  aidsByType: { aid_type: string; count: number; cash_total: number }[];
  recentAids: {
    id: number;
    code: string;
    aid_type: string;
    aid_date: string;
    status: string;
    cash_amount: number;
    beneficiary_name: string;
  }[];
  recentOperations: {
    id: number;
    user_name: string;
    action_type: string;
    section: string;
    result: string;
    created_at: string;
  }[];
}

export function DashboardView({
  association,
  user,
  onNavigate,
}: {
  association: AssociationSettings | null;
  user: UserRecord;
  onNavigate: (tab: NavTabKey) => void;
}) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<DashboardPayload>('/api/dashboard')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'تعذر تحميل إحصائيات لوحة التحكم.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <LoadingState label="جاري تحميل إحصائيات الجمعية المباشرة..." />;
  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800 text-sm">
        {error || 'لا توجد بيانات متاحة.'}
      </div>
    );
  }

  const { stats, lowStockItems, aidsByType, recentAids, recentOperations } = data;
  const maxAidCount = Math.max(1, ...aidsByType.map((a) => a.count));
  const maxFinance = Math.max(1, stats.donationsCashApproved, stats.totalExpenses);

  const kpiCards: {
    label: string;
    value: string | number;
    sub: string;
    tab: NavTabKey;
    icon: React.ComponentType<{ className?: string }>;
    accent?: boolean;
  }[] = [
    {
      label: 'إجمالي المستفيدين',
      value: stats.totalBeneficiaries,
      sub: `سجل المبادرات المستقل: ${stats.totalInitBeneficiaries}`,
      tab: 'beneficiaries',
      icon: Users,
    },
    {
      label: 'المساعدات المصروفة',
      value: stats.totalAidsDisbursed,
      sub: `بانتظار الاعتماد: ${stats.pendingAidsCount}`,
      tab: 'aids',
      icon: HandHeart,
    },
    {
      label: 'صافي الرصيد المالي',
      value: formatCurrency(stats.netBalance),
      sub: `تبرعات معتمدة: ${formatCurrency(stats.donationsCashApproved)}`,
      tab: 'donations',
      icon: Wallet,
      accent: true,
    },
    {
      label: 'المبادرات النشطة',
      value: stats.activeInitiatives,
      sub: `الموظفون: ${stats.employeesCount} · المتطوعون: ${stats.volunteersCount}`,
      tab: 'initiatives',
      icon: FolderKanban,
    },
    {
      label: 'عمليات تنتظر الاعتماد',
      value: stats.pendingApprovals,
      sub: `${stats.pendingAidsCount} مساعدة · ${stats.pendingDonationsCount} تبرع`,
      tab: 'aids',
      icon: Clock,
    },
    {
      label: 'تنبيهات المخزون',
      value: stats.lowStockCount,
      sub: stats.lowStockCount > 0 ? 'أصناف بلغت الحد الأدنى' : 'جميع الأرصدة آمنة',
      tab: 'inventory',
      icon: Package,
    },
    {
      label: 'الموظفون والمتطوعون',
      value: stats.employeesCount + stats.volunteersCount,
      sub: `${stats.employeesCount} موظف · ${stats.volunteersCount} متطوع`,
      tab: 'staff',
      icon: UserCheck,
    },
    {
      label: 'إجمالي المصروفات',
      value: formatCurrency(stats.totalExpenses),
      sub: `إجمالي التبرعات المسجلة: ${formatCurrency(stats.donationsTotal)}`,
      tab: 'donations',
      icon: Wallet,
    },
  ];

  return (
    <div>
      <PageHeader
        title={`مرحبًا، ${user.full_name}`}
        subtitle={`${association?.name || 'جمعية الخير للتنمية الشاملة بالمراشدة'} — نظرة عامة مباشرة على الأداء والعمليات`}
        actions={
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="px-4 py-2 bg-[#0d5c3e] hover:bg-[#09442e] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            استعراض التقارير الشاملة
          </button>
        }
      />

      {/* Interactive KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {kpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <button
              key={k.label}
              type="button"
              onClick={() => onNavigate(k.tab)}
              className={`text-right bg-white border rounded-xl p-4 hover:border-[#0d5c3e] transition-colors flex flex-col justify-between group ${
                k.accent ? 'border-[#c6973f]' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-xs font-semibold text-slate-600">{k.label}</span>
                <Icon className="w-4 h-4 text-[#0d5c3e] shrink-0" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">{k.value}</div>
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 w-full">
                <span className="truncate">{k.sub}</span>
                <ArrowLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0d5c3e] shrink-0" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Aids by Type Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">توزيع المساعدات حسب النوع</h2>
            <button
              type="button"
              onClick={() => onNavigate('aids')}
              className="text-xs font-semibold text-[#0d5c3e] hover:underline"
            >
              عرض سجل المساعدات
            </button>
          </div>
          {aidsByType.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">لم تُسجل مساعدات بعد.</p>
          ) : (
            <div className="space-y-3">
              {aidsByType.map((row) => {
                const pct = Math.round((row.count / maxAidCount) * 100);
                return (
                  <div key={row.aid_type}>
                    <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1">
                      <span>{row.aid_type}</span>
                      <span className="tabular-nums font-bold">
                        {row.count} مساعدة {row.cash_total > 0 ? `(${formatCurrency(row.cash_total)})` : ''}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0d5c3e] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Financial Summary */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">الملخص المالي (التبرعات والمصروفات)</h2>
              <button
                type="button"
                onClick={() => onNavigate('donations')}
                className="text-xs font-semibold text-[#0d5c3e] hover:underline"
              >
                الحسابات
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-slate-600">التبرعات النقدية المعتمدة</span>
                  <span className="font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(stats.donationsCashApproved)}
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{ width: `${Math.round((stats.donationsCashApproved / maxFinance) * 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-slate-600">إجمالي المصروفات المعتمدة</span>
                  <span className="font-bold text-amber-700 tabular-nums">
                    {formatCurrency(stats.totalExpenses)}
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#c6973f] rounded-full"
                    style={{ width: `${Math.round((stats.totalExpenses / maxFinance) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">الرصيد الصافي المتاح</span>
            <span className={`text-lg font-bold tabular-nums ${stats.netBalance >= 0 ? 'text-[#0d5c3e]' : 'text-red-700'}`}>
              {formatCurrency(stats.netBalance)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom 3-Column Operational Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Low Stock Alerts */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>تنبيهات المخزون</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-semibold text-[#0d5c3e] hover:underline"
            >
              إدارة المخازن
            </button>
          </div>
          {lowStockItems.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">لا توجد أصناف منخفضة حاليًا.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {lowStockItems.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="text-slate-500">{item.warehouse_name}</div>
                  </div>
                  <div className="text-left tabular-nums">
                    <div className="font-bold text-red-700">
                      {item.quantity} {item.unit}
                    </div>
                    <div className="text-slate-400">الحد الأدنى: {item.min_quantity}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Aids */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900">أحدث المساعدات</h2>
            <button
              type="button"
              onClick={() => onNavigate('aids')}
              className="text-xs font-semibold text-[#0d5c3e] hover:underline"
            >
              الكل
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentAids.map((a) => (
              <div key={a.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{a.beneficiary_name}</div>
                  <div className="text-slate-500 truncate">
                    {a.code} · {a.aid_type}
                  </div>
                </div>
                <StatusText status={a.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Audit Operations */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900">آخر العمليات المنفذة</h2>
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="text-xs font-semibold text-[#0d5c3e] hover:underline"
            >
              سجل التدقيق
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentOperations.slice(0, 6).map((op) => (
              <div key={op.id} className="py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{op.action_type}</span>
                  <span className="text-slate-400 tabular-nums">{formatDateArabic(op.created_at)}</span>
                </div>
                <div className="text-slate-500 mt-0.5">{op.user_name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
