import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/StatCard';
import { homes, getDashboardStats, upgradeInterestCategories } from '@/lib/mockData';
import { TrendingUp, Clock, Target, Blinds, Sparkles } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

export default function AdminAnalytics() {
  const stats = getDashboardStats();
  const funnelData = [
    { stage: 'Started', count: homes.length - (stats.statusCounts.not_started || 0), percentage: (((homes.length - (stats.statusCounts.not_started || 0)) / homes.length) * 100).toFixed(0) },
    { stage: 'Submitted', count: stats.completedCount, percentage: ((stats.completedCount / homes.length) * 100).toFixed(0) },
    { stage: 'Finalized', count: stats.statusCounts.finalized || 0, percentage: (((stats.statusCounts.finalized || 0) / homes.length) * 100).toFixed(0) },
  ];

  const revenueDistribution = [
    { range: '$0', count: homes.filter(h => h.windowExtensionTotal === 0).length, color: 'hsl(var(--muted))' },
    { range: '$1-1000', count: homes.filter(h => h.windowExtensionTotal > 0 && h.windowExtensionTotal <= 1000).length, color: 'hsl(var(--info))' },
    { range: '$1001-2000', count: homes.filter(h => h.windowExtensionTotal > 1000 && h.windowExtensionTotal <= 2000).length, color: 'hsl(var(--primary))' },
    { range: '$2000+', count: homes.filter(h => h.windowExtensionTotal > 2000).length, color: 'hsl(var(--accent))' },
  ];

  const upgradeInterestData = upgradeInterestCategories.map(cat => ({
    name: cat.name.replace(' Options', '').replace('Powered / Automated ', ''),
    count: stats.upgradeInterests[cat.id as keyof typeof stats.upgradeInterests] || 0,
    percentage: Math.round(((stats.upgradeInterests[cat.id as keyof typeof stats.upgradeInterests] || 0) / homes.length) * 100)
  }));

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div><h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Analytics & Insights</h1><p className="text-muted-foreground mt-1">Performance metrics and buyer behavior</p></div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Completion Rate" value={`${stats.completionRate}%`} subtitle={`${stats.completedCount} of ${stats.totalHomes}`} icon={<Target className="w-5 h-5 text-primary" />} />
          <StatCard title="Avg. Days to Complete" value="8.5" subtitle="From start to submission" icon={<Clock className="w-5 h-5 text-info" />} />
          <StatCard title="Window Attach Rate" value={`${stats.windowExtensionRate}%`} subtitle={`${stats.windowExtensionHomes} homes`} icon={<Blinds className="w-5 h-5 text-accent" />} />
          <StatCard title="Avg. Window/Home" value={`$${Math.round(stats.avgUpgradePerHome)}`} subtitle="Including GST" icon={<TrendingUp className="w-5 h-5 text-success" />} />
        </div>

        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-serif text-lg font-semibold text-foreground mb-6">Completion Funnel</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {funnelData.map((stage) => (
              <div key={stage.stage} className="text-center p-4 rounded-lg bg-primary/10">
                <p className="text-3xl font-serif font-bold text-primary">{stage.percentage}%</p>
                <p className="text-sm text-muted-foreground mt-1">{stage.stage}</p>
                <p className="text-xs text-muted-foreground">{stage.count} homes</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Revenue Distribution</h3>
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
          </div>

          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-4"><Sparkles className="w-5 h-5 text-accent" /><h3 className="font-serif text-lg font-semibold text-foreground">Upgrade Interest</h3></div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={upgradeInterestData} layout="vertical">
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
