import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Home, CheckCircle2, TrendingUp, Download, ArrowRight, Blinds, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface BuyerSelection {
  id: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  email: string;
  status: string | null;
  window_total: number | null;
  additional_windows_qty: number | null;
  patio_doors_qty: number | null;
  upgrade_interests: Record<string, boolean> | null;
  created_at: string;
}

const upgradeInterestCategories = [
  { id: 'flooring', name: 'Upgraded Flooring Options' },
  { id: 'tile', name: 'Tile Upgrades' },
  { id: 'heated-floor', name: 'Heated Tile Flooring' },
  { id: 'automation', name: 'Powered / Automated Window Coverings' },
];

export default function AdminDashboard() {
  const [submissions, setSubmissions] = useState<BuyerSelection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubmissions = async () => {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('*')
        .order('created_at', { ascending: false });

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

    const completedCount = (statusCounts.submitted || 0) + (statusCounts.reviewed || 0) + (statusCounts.finalized || 0);
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
      upgradeInterests,
    };
  };

  const stats = calculateStats();

  const statusData = [
    { name: 'Submitted', value: stats.statusCounts.submitted || 0, color: 'hsl(var(--info))' },
    { name: 'Reviewed', value: stats.statusCounts.reviewed || 0, color: 'hsl(var(--primary))' },
    { name: 'Finalized', value: stats.statusCounts.finalized || 0, color: 'hsl(var(--success))' },
  ];

  const upgradeDistribution = [
    { range: '$0', count: submissions.filter(s => (s.window_total || 0) === 0).length },
    { range: '$1-1000', count: submissions.filter(s => (s.window_total || 0) > 0 && (s.window_total || 0) <= 1000).length },
    { range: '$1001-2000', count: submissions.filter(s => (s.window_total || 0) > 1000 && (s.window_total || 0) <= 2000).length },
    { range: '$2000+', count: submissions.filter(s => (s.window_total || 0) > 2000).length },
  ];

  const recentSubmissions = submissions.slice(0, 5);

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Glendale Estates Dashboard</h1>
            <p className="text-muted-foreground mt-1">Managing {submissions.length} submissions</p>
          </div>
          <Button variant="outline" className="gap-2"><Download className="w-4 h-4" />Export Report</Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Submissions" value={stats.totalHomes} subtitle="Buyer submissions" icon={<Home className="w-5 h-5 text-primary" />} />
          <StatCard title="Completion Rate" value={`${stats.completionRate}%`} subtitle={`${stats.completedCount} processed`} icon={<CheckCircle2 className="w-5 h-5 text-success" />} />
          <StatCard title="Window Extensions" value={stats.windowExtensionHomes} subtitle={`${stats.windowExtensionRate}% attach rate`} icon={<Blinds className="w-5 h-5 text-accent" />} />
          <StatCard title="Window Revenue" value={`$${stats.totalWindowRevenue.toLocaleString()}`} subtitle="Including GST" icon={<TrendingUp className="w-5 h-5 text-primary" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Status Overview</h3>
            {submissions.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="w-40 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {statusData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                    </Pie></PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {statusData.map((status) => (
                    <div key={status.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} /><span className="text-sm text-muted-foreground">{status.name}</span></div>
                      <span className="font-medium">{status.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No submissions yet</p>
            )}
          </div>

          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Window Extension Revenue</h3>
            {submissions.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={upgradeDistribution}>
                    <XAxis dataKey="range" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No data available</p>
            )}
          </div>
        </div>

        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold text-foreground">Upgrade Interest Analytics</h3>
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {upgradeInterestCategories.map((cat) => (
              <div key={cat.id} className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">{cat.name}</p>
                <p className="text-2xl font-serif font-semibold text-foreground mt-1">{stats.upgradeInterests[cat.id] || 0}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold text-foreground">Recent Submissions</h3>
            <Link to="/admin/submissions"><Button variant="ghost" size="sm" className="gap-1">View All<ArrowRight className="w-4 h-4" /></Button></Link>
          </div>
          {recentSubmissions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Unit</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Buyer</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Window Total</th>
                </tr></thead>
                <tbody>
                  {recentSubmissions.map((submission) => (
                    <tr key={submission.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-2"><p className="font-medium text-foreground">{submission.unit_number}</p><p className="text-xs text-muted-foreground">{submission.unit_type || 'N/A'}</p></td>
                      <td className="py-3 px-2 text-sm text-foreground">{submission.first_name} {submission.last_name}</td>
                      <td className="py-3 px-2"><StatusBadge status={submission.status || 'submitted'} /></td>
                      <td className="py-3 px-2 text-right">{(submission.window_total || 0) > 0 ? <span className="font-medium text-foreground">${(submission.window_total || 0).toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No submissions yet</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}