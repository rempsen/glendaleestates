import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { homes, SelectionStatus, getStatusLabel, windowPricing } from '@/lib/mockData';
import { 
  Home, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Download, 
  ArrowRight,
  Users,
  Blinds,
  Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export default function AdminDashboard() {
  // Calculate stats
  const statusCounts = homes.reduce((acc, home) => {
    acc[home.status] = (acc[home.status] || 0) + 1;
    return acc;
  }, {} as Record<SelectionStatus, number>);

  const completedCount = (statusCounts.submitted || 0) + (statusCounts.reviewed || 0) + (statusCounts.finalized || 0);
  const completionRate = Math.round((completedCount / homes.length) * 100);

  const windowExtensions = homes.filter(h => h.windowExtensions).length;
  const totalUpgradeValue = homes.reduce((sum, h) => sum + h.estimatedUpgradeValue, 0);
  const avgUpgradeValue = Math.round(totalUpgradeValue / homes.filter(h => h.estimatedUpgradeValue > 0).length) || 0;

  // Upgrade interests
  const upgradeInterests = homes.reduce((acc, home) => {
    home.selections?.upgradeInterests.forEach(interest => {
      acc[interest] = (acc[interest] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  // Chart data
  const statusData = [
    { name: 'Not Started', value: statusCounts.not_started || 0, color: 'hsl(var(--muted))' },
    { name: 'In Progress', value: statusCounts.in_progress || 0, color: 'hsl(var(--warning))' },
    { name: 'Submitted', value: statusCounts.submitted || 0, color: 'hsl(var(--info))' },
    { name: 'Reviewed', value: statusCounts.reviewed || 0, color: 'hsl(var(--primary))' },
    { name: 'Finalized', value: statusCounts.finalized || 0, color: 'hsl(var(--success))' },
  ];

  const upgradeDistribution = [
    { range: 'No Upgrade', count: homes.filter(h => h.estimatedUpgradeValue === 0).length },
    { range: '$1-500', count: homes.filter(h => h.estimatedUpgradeValue > 0 && h.estimatedUpgradeValue <= 500).length },
    { range: '$501-1000', count: homes.filter(h => h.estimatedUpgradeValue > 500 && h.estimatedUpgradeValue <= 1000).length },
    { range: '$1000+', count: homes.filter(h => h.estimatedUpgradeValue > 1000).length },
  ];

  // Recent activity
  const recentHomes = [...homes]
    .sort((a, b) => new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime())
    .slice(0, 5);

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
              Glendale Estates Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Managing {homes.length} homes • Last updated today
            </p>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Homes"
            value={homes.length}
            subtitle="In Glendale Estates"
            icon={<Home className="w-5 h-5 text-primary" />}
          />
          <StatCard
            title="Completion Rate"
            value={`${completionRate}%`}
            subtitle={`${completedCount} of ${homes.length} submitted`}
            icon={<CheckCircle2 className="w-5 h-5 text-success" />}
          />
          <StatCard
            title="Window Extensions"
            value={windowExtensions}
            subtitle="Homes with add-ons"
            icon={<Blinds className="w-5 h-5 text-accent" />}
          />
          <StatCard
            title="Projected Revenue"
            value={`$${totalUpgradeValue.toLocaleString()}`}
            subtitle={`Avg: $${avgUpgradeValue}/home`}
            icon={<TrendingUp className="w-5 h-5 text-primary" />}
          />
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Status Funnel */}
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">
              Selection Status Funnel
            </h3>
            <div className="flex items-center gap-6">
              <div className="w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {statusData.map((status) => (
                  <div key={status.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="text-sm text-muted-foreground">{status.name}</span>
                    </div>
                    <span className="font-medium">{status.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Upgrade Distribution */}
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">
              Upgrade Value Distribution
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={upgradeDistribution}>
                  <XAxis 
                    dataKey="range" 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Upgrade Interests */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Upgrade Interest Analytics
            </h3>
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(upgradeInterests).map(([key, count]) => (
              <div key={key} className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground capitalize">
                  {key.replace(/-/g, ' ')}
                </p>
                <p className="text-2xl font-serif font-semibold text-foreground mt-1">
                  {count}
                </p>
                <p className="text-xs text-muted-foreground">
                  {Math.round((count / homes.length) * 100)}% of buyers
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Recent Activity
            </h3>
            <Link to="/admin/homes">
              <Button variant="ghost" size="sm" className="gap-1">
                View All
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Lot</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Buyer</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Last Activity</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Upgrade Value</th>
                </tr>
              </thead>
              <tbody>
                {recentHomes.map((home) => (
                  <tr key={home.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 px-2">
                      <div>
                        <p className="font-medium text-foreground">{home.lot}</p>
                        <p className="text-xs text-muted-foreground">{home.address}</p>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-sm text-foreground">{home.buyerName}</td>
                    <td className="py-3 px-2">
                      <StatusBadge status={home.status} />
                    </td>
                    <td className="py-3 px-2 text-sm text-muted-foreground">{home.lastActivityDate}</td>
                    <td className="py-3 px-2 text-right">
                      {home.estimatedUpgradeValue > 0 ? (
                        <span className="font-medium text-foreground">
                          ${home.estimatedUpgradeValue.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
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
