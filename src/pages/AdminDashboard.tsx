import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { homes, getDashboardStats, upgradeInterestCategories } from '@/lib/mockData';
import { Home, CheckCircle2, TrendingUp, Download, ArrowRight, Blinds, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export default function AdminDashboard() {
  const stats = getDashboardStats();

  const statusData = [
    { name: 'Not Started', value: stats.statusCounts.not_started || 0, color: 'hsl(var(--muted))' },
    { name: 'In Progress', value: stats.statusCounts.in_progress || 0, color: 'hsl(var(--warning))' },
    { name: 'Submitted', value: stats.statusCounts.submitted || 0, color: 'hsl(var(--info))' },
    { name: 'Reviewed', value: stats.statusCounts.reviewed || 0, color: 'hsl(var(--primary))' },
    { name: 'Finalized', value: stats.statusCounts.finalized || 0, color: 'hsl(var(--success))' },
  ];

  const upgradeDistribution = [
    { range: '$0', count: homes.filter(h => h.windowExtensionTotal === 0).length },
    { range: '$1-1000', count: homes.filter(h => h.windowExtensionTotal > 0 && h.windowExtensionTotal <= 1000).length },
    { range: '$1001-2000', count: homes.filter(h => h.windowExtensionTotal > 1000 && h.windowExtensionTotal <= 2000).length },
    { range: '$2000+', count: homes.filter(h => h.windowExtensionTotal > 2000).length },
  ];

  const recentHomes = [...homes]
    .sort((a, b) => new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime())
    .slice(0, 5);

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Glendale Estates Dashboard</h1>
            <p className="text-muted-foreground mt-1">Managing {homes.length} homes</p>
          </div>
          <Button variant="outline" className="gap-2"><Download className="w-4 h-4" />Export Report</Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Homes" value={stats.totalHomes} subtitle="In Glendale Estates" icon={<Home className="w-5 h-5 text-primary" />} />
          <StatCard title="Completion Rate" value={`${stats.completionRate}%`} subtitle={`${stats.completedCount} submitted`} icon={<CheckCircle2 className="w-5 h-5 text-success" />} />
          <StatCard title="Window Extensions" value={stats.windowExtensionHomes} subtitle={`${stats.windowExtensionRate}% attach rate`} icon={<Blinds className="w-5 h-5 text-accent" />} />
          <StatCard title="Window Revenue" value={`$${stats.totalWindowRevenue.toLocaleString()}`} subtitle="Including GST" icon={<TrendingUp className="w-5 h-5 text-primary" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Status Funnel</h3>
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
          </div>

          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Window Extension Revenue</h3>
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
                <p className="text-2xl font-serif font-semibold text-foreground mt-1">{stats.upgradeInterests[cat.id as keyof typeof stats.upgradeInterests] || 0}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold text-foreground">Recent Activity</h3>
            <Link to="/admin/homes"><Button variant="ghost" size="sm" className="gap-1">View All<ArrowRight className="w-4 h-4" /></Button></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Lot</th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Buyer</th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Window Total</th>
              </tr></thead>
              <tbody>
                {recentHomes.map((home) => (
                  <tr key={home.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 px-2"><p className="font-medium text-foreground">{home.lot}</p><p className="text-xs text-muted-foreground">{home.address}</p></td>
                    <td className="py-3 px-2 text-sm text-foreground">{home.buyerName}</td>
                    <td className="py-3 px-2"><StatusBadge status={home.status} /></td>
                    <td className="py-3 px-2 text-right">{home.windowExtensionTotal > 0 ? <span className="font-medium text-foreground">${home.windowExtensionTotal.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
