import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/StatCard';
import { homes, SelectionStatus, upgradeOptions, windowPricing } from '@/lib/mockData';
import { 
  TrendingUp, 
  Users, 
  Clock, 
  Target,
  Blinds,
  Sparkles
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export default function AdminAnalytics() {
  // Calculate key metrics
  const statusCounts = homes.reduce((acc, home) => {
    acc[home.status] = (acc[home.status] || 0) + 1;
    return acc;
  }, {} as Record<SelectionStatus, number>);

  const completedCount = (statusCounts.submitted || 0) + (statusCounts.reviewed || 0) + (statusCounts.finalized || 0);
  const inProgressCount = statusCounts.in_progress || 0;
  const notStartedCount = statusCounts.not_started || 0;

  // Funnel percentages
  const funnelData = [
    { stage: 'Started', count: homes.length - notStartedCount, percentage: ((homes.length - notStartedCount) / homes.length * 100).toFixed(0) },
    { stage: 'In Progress', count: inProgressCount + completedCount, percentage: ((inProgressCount + completedCount) / homes.length * 100).toFixed(0) },
    { stage: 'Submitted', count: completedCount, percentage: (completedCount / homes.length * 100).toFixed(0) },
    { stage: 'Finalized', count: statusCounts.finalized || 0, percentage: ((statusCounts.finalized || 0) / homes.length * 100).toFixed(0) },
  ];

  // Average days calculation (simulated)
  const avgDaysToComplete = 8.5;
  const avgDaysInProgress = 3.2;

  // Upgrade analytics
  const windowExtensionHomes = homes.filter(h => h.windowExtensions).length;
  const totalWindowRevenue = homes.reduce((sum, h) => sum + h.estimatedUpgradeValue, 0);
  const avgUpgradePerHome = totalWindowRevenue / homes.length;

  // Upgrade interest breakdown
  const upgradeInterestData = upgradeOptions.map(option => {
    const count = homes.filter(h => h.selections?.upgradeInterests.includes(option.id)).length;
    return {
      name: option.name,
      count,
      percentage: Math.round((count / homes.length) * 100)
    };
  });

  // Revenue distribution
  const revenueDistribution = [
    { range: '$0', count: homes.filter(h => h.estimatedUpgradeValue === 0).length, color: 'hsl(var(--muted))' },
    { range: '$1-500', count: homes.filter(h => h.estimatedUpgradeValue > 0 && h.estimatedUpgradeValue <= 500).length, color: 'hsl(var(--info))' },
    { range: '$501-1000', count: homes.filter(h => h.estimatedUpgradeValue > 500 && h.estimatedUpgradeValue <= 1000).length, color: 'hsl(var(--primary))' },
    { range: '$1000+', count: homes.filter(h => h.estimatedUpgradeValue > 1000).length, color: 'hsl(var(--accent))' },
  ];

  // Simulated weekly progress data
  const weeklyProgress = [
    { week: 'Week 1', notStarted: 75, inProgress: 0, completed: 0 },
    { week: 'Week 2', notStarted: 55, inProgress: 15, completed: 5 },
    { week: 'Week 3', notStarted: 35, inProgress: 25, completed: 15 },
    { week: 'Week 4', notStarted: 20, inProgress: 30, completed: 25 },
    { week: 'Week 5', notStarted: notStartedCount, inProgress: inProgressCount, completed: completedCount },
  ];

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
            Analytics & Insights
          </h1>
          <p className="text-muted-foreground mt-1">
            Performance metrics and buyer behavior analysis
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Completion Rate"
            value={`${Math.round((completedCount / homes.length) * 100)}%`}
            subtitle={`${completedCount} of ${homes.length} homes`}
            icon={<Target className="w-5 h-5 text-primary" />}
          />
          <StatCard
            title="Avg. Days to Complete"
            value={avgDaysToComplete.toFixed(1)}
            subtitle="From start to submission"
            icon={<Clock className="w-5 h-5 text-info" />}
          />
          <StatCard
            title="Window Add-on Rate"
            value={`${Math.round((windowExtensionHomes / homes.length) * 100)}%`}
            subtitle={`${windowExtensionHomes} homes with extensions`}
            icon={<Blinds className="w-5 h-5 text-accent" />}
          />
          <StatCard
            title="Avg. Upgrade/Home"
            value={`$${avgUpgradePerHome.toFixed(0)}`}
            subtitle="Window coverings only"
            icon={<TrendingUp className="w-5 h-5 text-success" />}
          />
        </div>

        {/* Funnel Analysis */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-serif text-lg font-semibold text-foreground mb-6">
            Selection Completion Funnel
          </h3>
          <div className="grid gap-4 sm:grid-cols-4">
            {funnelData.map((stage, index) => (
              <div key={stage.stage} className="relative">
                <div className="text-center p-4 rounded-lg bg-primary/10">
                  <p className="text-3xl font-serif font-bold text-primary">{stage.percentage}%</p>
                  <p className="text-sm text-muted-foreground mt-1">{stage.stage}</p>
                  <p className="text-xs text-muted-foreground">{stage.count} homes</p>
                </div>
                {index < funnelData.length - 1 && (
                  <div className="hidden sm:block absolute top-1/2 -right-2 transform -translate-y-1/2 text-muted-foreground">
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Progress Over Time */}
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">
              Progress Over Time
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyProgress}>
                  <XAxis 
                    dataKey="week" 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="completed" 
                    stackId="1"
                    stroke="hsl(var(--success))" 
                    fill="hsl(var(--success))"
                    fillOpacity={0.6}
                    name="Completed"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="inProgress" 
                    stackId="1"
                    stroke="hsl(var(--warning))" 
                    fill="hsl(var(--warning))"
                    fillOpacity={0.6}
                    name="In Progress"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="notStarted" 
                    stackId="1"
                    stroke="hsl(var(--muted))" 
                    fill="hsl(var(--muted))"
                    fillOpacity={0.6}
                    name="Not Started"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue Distribution */}
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">
              Upgrade Value Distribution
            </h3>
            <div className="flex items-center gap-6">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="count"
                    >
                      {revenueDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3">
                {revenueDistribution.map((item) => (
                  <div key={item.range} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-muted-foreground">{item.range}</span>
                    </div>
                    <span className="font-medium">{item.count} homes</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade Interest Analysis */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-5 h-5 text-accent" />
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Future Upgrade Interest (Phase 2 Forecast)
            </h3>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={upgradeInterestData} layout="vertical">
                  <XAxis type="number" />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={120}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
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
                    fill="hsl(var(--accent))" 
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Based on buyer selections, these upgrades show the highest demand for Phase 2 implementation.
              </p>
              <div className="grid gap-3">
                {upgradeInterestData.sort((a, b) => b.count - a.count).map((item, index) => (
                  <div key={item.name} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                    <span className="text-lg font-bold text-accent">#{index + 1}</span>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.count} interested ({item.percentage}% of buyers)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottleneck Identification */}
        <div className="p-6 rounded-xl border border-warning/30 bg-warning/5">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-warning" />
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Bottleneck Analysis
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-lg bg-card border border-border">
              <p className="text-sm text-muted-foreground">Not Yet Started</p>
              <p className="text-2xl font-serif font-bold text-foreground mt-1">{notStartedCount}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((notStartedCount / homes.length) * 100)}% of total
              </p>
            </div>
            <div className="p-4 rounded-lg bg-card border border-border">
              <p className="text-sm text-muted-foreground">Stalled In Progress</p>
              <p className="text-2xl font-serif font-bold text-foreground mt-1">
                {Math.round(inProgressCount * 0.3)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                No activity 7+ days
              </p>
            </div>
            <div className="p-4 rounded-lg bg-card border border-border">
              <p className="text-sm text-muted-foreground">Awaiting Review</p>
              <p className="text-2xl font-serif font-bold text-foreground mt-1">{statusCounts.submitted || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ready for BMD review
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
