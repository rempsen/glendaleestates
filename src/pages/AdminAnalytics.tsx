import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, Clock, Target, Blinds, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface BuyerSelection {
  id: string;
  status: string | null;
  window_total: number | null;
  additional_windows_qty: number | null;
  patio_doors_qty: number | null;
  upgrade_interests: Record<string, boolean> | null;
}

const upgradeInterestCategories = [
  { id: 'flooring', name: 'Upgraded Flooring' },
  { id: 'tile', name: 'Tile Upgrades' },
  { id: 'heated-floor', name: 'Heated Flooring' },
  { id: 'automation', name: 'Window Coverings' },
];

export default function AdminAnalytics() {
  const [submissions, setSubmissions] = useState<BuyerSelection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubmissions = async () => {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('id, status, window_total, additional_windows_qty, patio_doors_qty, upgrade_interests');

      if (!error && data) {
        setSubmissions(data as BuyerSelection[]);
      }
      setLoading(false);
    };

    fetchSubmissions();
  }, []);

  const calculateStats = () => {
    const statusCounts: Record<string, number> = {};
    submissions.forEach(s => {
      const status = s.status || 'submitted';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const completedCount = (statusCounts.reviewed || 0) + (statusCounts.finalized || 0);
    const windowExtensionHomes = submissions.filter(s => (s.additional_windows_qty || 0) > 0 || (s.patio_doors_qty || 0) > 0).length;
    const totalWindowRevenue = submissions.reduce((sum, s) => sum + (s.window_total || 0), 0);

    const upgradeInterests: Record<string, number> = {
      flooring: 0,
      tile: 0,
      'heated-floor': 0,
      automation: 0,
    };
    submissions.forEach(s => {
      if (s.upgrade_interests) {
        Object.keys(s.upgrade_interests).forEach(key => {
          if (s.upgrade_interests![key]) {
            upgradeInterests[key] = (upgradeInterests[key] || 0) + 1;
          }
        });
      }
    });

    return {
      totalHomes: submissions.length,
      statusCounts,
      completedCount,
      completionRate: submissions.length > 0 ? Math.round((completedCount / submissions.length) * 100) : 0,
      windowExtensionHomes,
      windowExtensionRate: submissions.length > 0 ? Math.round((windowExtensionHomes / submissions.length) * 100) : 0,
      totalWindowRevenue,
      avgUpgradePerHome: submissions.length > 0 ? totalWindowRevenue / submissions.length : 0,
      upgradeInterests,
    };
  };

  const stats = calculateStats();

  const funnelData = [
    { stage: 'Submitted', count: submissions.length, percentage: 100 },
    { stage: 'Reviewed', count: stats.statusCounts.reviewed || 0, percentage: submissions.length > 0 ? Math.round(((stats.statusCounts.reviewed || 0) / submissions.length) * 100) : 0 },
    { stage: 'Finalized', count: stats.statusCounts.finalized || 0, percentage: submissions.length > 0 ? Math.round(((stats.statusCounts.finalized || 0) / submissions.length) * 100) : 0 },
  ];

  const revenueDistribution = [
    { range: '$0', count: submissions.filter(s => (s.window_total || 0) === 0).length, color: 'hsl(var(--muted))' },
    { range: '$1-1000', count: submissions.filter(s => (s.window_total || 0) > 0 && (s.window_total || 0) <= 1000).length, color: 'hsl(var(--info))' },
    { range: '$1001-2000', count: submissions.filter(s => (s.window_total || 0) > 1000 && (s.window_total || 0) <= 2000).length, color: 'hsl(var(--primary))' },
    { range: '$2000+', count: submissions.filter(s => (s.window_total || 0) > 2000).length, color: 'hsl(var(--accent))' },
  ];

  const upgradeInterestData = upgradeInterestCategories.map(cat => ({
    name: cat.name,
    count: stats.upgradeInterests[cat.id] || 0,
    percentage: submissions.length > 0 ? Math.round(((stats.upgradeInterests[cat.id] || 0) / submissions.length) * 100) : 0
  }));

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-8">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div><h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Analytics & Insights</h1><p className="text-muted-foreground mt-1">Performance metrics and buyer behavior</p></div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Submissions" value={stats.totalHomes} subtitle="Buyer submissions" icon={<Target className="w-5 h-5 text-primary" />} />
          <StatCard title="Processing Rate" value={`${stats.completionRate}%`} subtitle={`${stats.completedCount} reviewed/finalized`} icon={<Clock className="w-5 h-5 text-info" />} />
          <StatCard title="Window Attach Rate" value={`${stats.windowExtensionRate}%`} subtitle={`${stats.windowExtensionHomes} with extensions`} icon={<Blinds className="w-5 h-5 text-accent" />} />
          <StatCard title="Avg. Window/Submission" value={`$${Math.round(stats.avgUpgradePerHome)}`} subtitle="Including GST" icon={<TrendingUp className="w-5 h-5 text-success" />} />
        </div>

        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-serif text-lg font-semibold text-foreground mb-6">Processing Funnel</h3>
          {submissions.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {funnelData.map((stage) => (
                <div key={stage.stage} className="text-center p-4 rounded-lg bg-primary/10">
                  <p className="text-3xl font-serif font-bold text-primary">{stage.percentage}%</p>
                  <p className="text-sm text-muted-foreground mt-1">{stage.stage}</p>
                  <p className="text-xs text-muted-foreground">{stage.count} submissions</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Revenue Distribution</h3>
            {submissions.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={revenueDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="count">{revenueDistribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}</Pie></PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3">
                  {revenueDistribution.map((item) => (<div key={item.range} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-sm text-muted-foreground">{item.range}</span></div><span className="font-medium">{item.count}</span></div>))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No data available</p>
            )}
          </div>

          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-4"><Sparkles className="w-5 h-5 text-accent" /><h3 className="font-serif text-lg font-semibold text-foreground">Upgrade Interest</h3></div>
            {submissions.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={upgradeInterestData} layout="vertical">
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No data available</p>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}