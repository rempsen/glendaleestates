import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Palette,
  Home,
  Thermometer,
  Grid3X3,
  Blinds
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  FunnelChart, 
  Funnel, 
  LabelList,
  Legend
} from 'recharts';

interface BuyerSelection {
  id: string;
  status: string | null;
  window_total: number | null;
  additional_windows_qty: number | null;
  patio_doors_qty: number | null;
  lvp_colour: string | null;
  bedroom_carpet_colour: string | null;
  bedroom_flooring_choice: string | null;
  hardwood_upgrade_selected: boolean | null;
  bathroom_tile_selected: boolean | null;
  heated_floor_bathrooms: number | null;
  backsplash_orientation: string | null;
  area_upgrades: unknown;
  upgrade_interests: Record<string, boolean> | null;
}

interface PipelineRecord {
  id: string;
  pipeline_stage: string;
  contract_signed: boolean;
  deposit_received: boolean;
  contract_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  'hsl(var(--accent))',
  'hsl(var(--destructive))',
];

const TOTAL_UNITS = 70;

export default function AdminSalesAnalytics() {
  const [selections, setSelections] = useState<BuyerSelection[]>([]);
  const [pipeline, setPipeline] = useState<PipelineRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [selectionsResult, pipelineResult] = await Promise.all([
        supabase.from('buyer_selections').select('*'),
        supabase.from('sales_pipeline').select('*'),
      ]);

      if (selectionsResult.data) setSelections(selectionsResult.data as BuyerSelection[]);
      if (pipelineResult.data) setPipeline(pipelineResult.data as PipelineRecord[]);
      setLoading(false);
    };

    fetchData();
  }, []);

  // Pipeline stats
  const pipelineStats = {
    lead: pipeline.filter(p => p.pipeline_stage === 'lead').length,
    meeting: pipeline.filter(p => p.pipeline_stage === 'meeting').length,
    quoted: pipeline.filter(p => p.pipeline_stage === 'quoted').length,
    signed: pipeline.filter(p => p.pipeline_stage === 'signed').length,
    totalContractValue: pipeline.reduce((sum, p) => sum + (p.contract_amount || 0), 0),
    totalRevenue: pipeline.reduce((sum, p) => sum + (p.total_amount || 0), 0),
    contractsSigned: pipeline.filter(p => p.contract_signed).length,
    depositsReceived: pipeline.filter(p => p.deposit_received).length,
  };

  // Selection stats
  const selectionStats = {
    total: selections.length,
    windowRevenue: selections.reduce((sum, s) => sum + (s.window_total || 0), 0),
    hardwoodUpgrades: selections.filter(s => s.hardwood_upgrade_selected).length,
    tileUpgrades: selections.filter(s => s.bathroom_tile_selected).length,
    heatedFloors: selections.filter(s => (s.heated_floor_bathrooms || 0) > 0).length,
    windowExtensions: selections.filter(s => (s.additional_windows_qty || 0) > 0 || (s.patio_doors_qty || 0) > 0).length,
  };

  // Conversion metrics
  const conversionRate = pipeline.length > 0 
    ? ((pipelineStats.signed / pipeline.length) * 100).toFixed(1)
    : '0';
  const avgContractValue = pipelineStats.contractsSigned > 0
    ? pipelineStats.totalContractValue / pipelineStats.contractsSigned
    : 0;
  const avgPerClientMet = pipeline.length > 0
    ? pipelineStats.totalContractValue / pipeline.length
    : 0;

  // Popular LVP colors
  const lvpColorCounts: Record<string, number> = {};
  selections.forEach(s => {
    if (s.lvp_colour) {
      lvpColorCounts[s.lvp_colour] = (lvpColorCounts[s.lvp_colour] || 0) + 1;
    }
  });
  const lvpColorData = Object.entries(lvpColorCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Popular carpet colors
  const carpetColorCounts: Record<string, number> = {};
  selections.forEach(s => {
    if (s.bedroom_carpet_colour) {
      carpetColorCounts[s.bedroom_carpet_colour] = (carpetColorCounts[s.bedroom_carpet_colour] || 0) + 1;
    }
  });
  const carpetColorData = Object.entries(carpetColorCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Upgrade popularity
  const upgradePopularity = [
    { name: 'Window Coverings', value: selectionStats.windowExtensions, fill: CHART_COLORS[0] },
    { name: 'Hardwood Flooring', value: selectionStats.hardwoodUpgrades, fill: CHART_COLORS[1] },
    { name: 'Tile Upgrade', value: selectionStats.tileUpgrades, fill: CHART_COLORS[2] },
    { name: 'Heated Floors', value: selectionStats.heatedFloors, fill: CHART_COLORS[3] },
  ].sort((a, b) => b.value - a.value);

  // Funnel data
  const funnelData = [
    { name: 'Total Units', value: TOTAL_UNITS, fill: 'hsl(var(--muted-foreground))' },
    { name: 'Contacted', value: pipeline.length, fill: 'hsl(var(--info))' },
    { name: 'Meeting', value: pipelineStats.meeting + pipelineStats.quoted + pipelineStats.signed, fill: 'hsl(var(--warning))' },
    { name: 'Quoted', value: pipelineStats.quoted + pipelineStats.signed, fill: 'hsl(var(--primary))' },
    { name: 'Signed', value: pipelineStats.signed, fill: 'hsl(var(--success))' },
  ];

  // Revenue breakdown
  const revenueBreakdown = [
    { name: 'Contract Revenue', value: pipelineStats.totalContractValue },
    { name: 'GST Collected', value: pipeline.reduce((sum, p) => sum + (p.tax_amount || 0), 0) },
    { name: 'Window Revenue', value: selectionStats.windowRevenue },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Sales Analytics</h1>
          <p className="text-muted-foreground mt-1">Performance metrics and buyer preferences</p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            title="Total Sales" 
            value={`$${pipelineStats.totalRevenue.toLocaleString()}`} 
            subtitle={`${pipelineStats.contractsSigned} contracts signed`} 
            icon={<DollarSign className="w-5 h-5 text-success" />} 
          />
          <StatCard 
            title="Conversion Rate" 
            value={`${conversionRate}%`} 
            subtitle={`${pipelineStats.signed} of ${pipeline.length} leads`} 
            icon={<TrendingUp className="w-5 h-5 text-primary" />} 
          />
          <StatCard 
            title="Avg per Client Met" 
            value={`$${Math.round(avgPerClientMet).toLocaleString()}`} 
            subtitle="Revenue per lead" 
            icon={<Users className="w-5 h-5 text-accent" />} 
          />
          <StatCard 
            title="Avg Contract Value" 
            value={`$${Math.round(avgContractValue).toLocaleString()}`} 
            subtitle="Per signed deal" 
            icon={<Home className="w-5 h-5 text-primary" />} 
          />
        </div>

        {/* Funnel & Revenue */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Sales Funnel */}
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Sales Funnel</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))', 
                      borderRadius: '8px' 
                    }} 
                  />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    <LabelList position="right" fill="hsl(var(--foreground))" stroke="none" dataKey="name" />
                    <LabelList position="center" fill="hsl(var(--primary-foreground))" stroke="none" dataKey="value" />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Revenue Breakdown</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueBreakdown} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} width={120} />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Amount']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))', 
                      borderRadius: '8px' 
                    }} 
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Popular Options */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Popular LVP Colors */}
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-5 h-5 text-primary" />
              <h3 className="font-serif text-lg font-semibold text-foreground">Popular LVP Colors</h3>
            </div>
            {lvpColorData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lvpColorData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} angle={-45} textAnchor="end" height={80} />
                    <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No color data yet</p>
            )}
          </div>

          {/* Popular Carpet Colors */}
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <Grid3X3 className="w-5 h-5 text-accent" />
              <h3 className="font-serif text-lg font-semibold text-foreground">Popular Carpet Colors</h3>
            </div>
            {carpetColorData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={carpetColorData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} angle={-45} textAnchor="end" height={80} />
                    <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No color data yet</p>
            )}
          </div>
        </div>

        {/* Upgrade Popularity */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Upgrade Popularity</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {upgradePopularity.map((upgrade, i) => (
              <div key={upgrade.name} className="p-4 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  {i === 0 && <Blinds className="w-4 h-4 text-muted-foreground" />}
                  {i === 1 && <Home className="w-4 h-4 text-muted-foreground" />}
                  {i === 2 && <Grid3X3 className="w-4 h-4 text-muted-foreground" />}
                  {i === 3 && <Thermometer className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-sm text-muted-foreground">{upgrade.name}</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-serif font-semibold text-foreground">{upgrade.value}</span>
                  <span className="text-sm text-muted-foreground">
                    {selections.length > 0 ? Math.round((upgrade.value / selections.length) * 100) : 0}%
                  </span>
                </div>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all" 
                    style={{ 
                      width: `${selections.length > 0 ? (upgrade.value / selections.length) * 100 : 0}%`,
                      backgroundColor: upgrade.fill
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-2xl font-serif font-semibold text-foreground">{TOTAL_UNITS}</p>
            <p className="text-xs text-muted-foreground">Total Units</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-2xl font-serif font-semibold text-foreground">{pipeline.length}</p>
            <p className="text-xs text-muted-foreground">Contacted</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-2xl font-serif font-semibold text-foreground">{pipelineStats.signed}</p>
            <p className="text-xs text-muted-foreground">Signed</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-2xl font-serif font-semibold text-foreground">{pipelineStats.depositsReceived}</p>
            <p className="text-xs text-muted-foreground">Deposits In</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-2xl font-serif font-semibold text-foreground">{selectionStats.total}</p>
            <p className="text-xs text-muted-foreground">Selections Made</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-2xl font-serif font-semibold text-foreground">${(selectionStats.windowRevenue / 1000).toFixed(1)}k</p>
            <p className="text-xs text-muted-foreground">Window Revenue</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
