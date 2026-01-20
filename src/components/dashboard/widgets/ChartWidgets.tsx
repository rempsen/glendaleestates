import { useState } from 'react';
import { 
  ResponsiveContainer, 
  FunnelChart, 
  Funnel, 
  LabelList, 
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend
} from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FunnelWidgetProps {
  data: { name: string; value: number; fill: string }[];
  totalUnits: number;
}

export function PipelineFunnelWidget({ data, totalUnits }: FunnelWidgetProps) {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = (data: any) => {
    setSelectedStage(data.name);
    setDialogOpen(true);
  };

  const selectedData = data.find(d => d.name === selectedStage);

  return (
    <>
      <div className="h-full min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '8px' 
              }}
              formatter={(value: number, name: string) => [
                `${value} units (${((value / totalUnits) * 100).toFixed(1)}%)`,
                name
              ]}
            />
            <Funnel 
              dataKey="value" 
              data={data} 
              isAnimationActive
              onClick={handleClick}
              style={{ cursor: 'pointer' }}
            >
              <LabelList 
                position="right" 
                fill="hsl(var(--foreground))" 
                stroke="none" 
                dataKey="name" 
                fontSize={12}
              />
              <LabelList 
                position="center" 
                fill="hsl(var(--primary-foreground))" 
                stroke="none" 
                dataKey="value"
                fontSize={14}
                fontWeight="bold"
              />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedStage}
              <Badge variant="outline">{selectedData?.value} units</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Percentage of Total</p>
                <p className="text-2xl font-semibold">
                  {selectedData ? ((selectedData.value / totalUnits) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Stage Conversion</p>
                <p className="text-2xl font-semibold">
                  {selectedData && data.length > 0 
                    ? ((selectedData.value / data[0].value) * 100).toFixed(1) 
                    : 0}%
                </p>
              </div>
            </div>
            <Link to="/admin/pipeline">
              <Button className="w-full gap-2">
                View Pipeline Details
                <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface StatusPieWidgetProps {
  data: { name: string; value: number; color: string }[];
}

export function StatusPieWidget({ data }: StatusPieWidgetProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="h-full min-h-[200px] flex items-center gap-4">
      <div className="flex-1 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="50%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color} 
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.5}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '8px' 
              }}
              formatter={(value: number) => [`${value} (${((value / total) * 100).toFixed(1)}%)`, 'Count']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 min-w-[100px]">
        {data.map((status, index) => (
          <div 
            key={status.name} 
            className="flex items-center justify-between gap-2 cursor-pointer transition-opacity"
            style={{ opacity: activeIndex === null || activeIndex === index ? 1 : 0.5 }}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
              <span className="text-xs text-muted-foreground">{status.name}</span>
            </div>
            <span className="text-sm font-medium">{status.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RevenueChartWidgetProps {
  data: { name: string; value: number }[];
}

export function RevenueChartWidget({ data }: RevenueChartWidgetProps) {
  const [activeBar, setActiveBar] = useState<string | null>(null);

  return (
    <div className="h-full min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <XAxis 
            type="number" 
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
            tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
          />
          <YAxis 
            type="category" 
            dataKey="name" 
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
            width={100}
          />
          <Tooltip 
            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Amount']}
            contentStyle={{ 
              backgroundColor: 'hsl(var(--card))', 
              border: '1px solid hsl(var(--border))', 
              borderRadius: '8px' 
            }}
            cursor={{ fill: 'hsl(var(--muted))' }}
          />
          <Bar 
            dataKey="value" 
            fill="hsl(var(--primary))" 
            radius={[0, 4, 4, 0]}
            onMouseEnter={(data) => setActiveBar(data.name)}
            onMouseLeave={() => setActiveBar(null)}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface UpgradePopularityWidgetProps {
  data: { name: string; value: number; fill: string }[];
  total: number;
}

export function UpgradePopularityWidget({ data, total }: UpgradePopularityWidgetProps) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<string | null>(null);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 h-full">
      {data.map((upgrade) => {
        const percentage = total > 0 ? (upgrade.value / total) * 100 : 0;
        return (
          <div 
            key={upgrade.name} 
            className={`p-3 rounded-lg transition-colors cursor-pointer ${
              selectedUpgrade === upgrade.name 
                ? 'bg-primary/10 ring-1 ring-primary/30' 
                : 'bg-muted/30 hover:bg-muted/50'
            }`}
            onClick={() => setSelectedUpgrade(selectedUpgrade === upgrade.name ? null : upgrade.name)}
            title={`Click to ${selectedUpgrade === upgrade.name ? 'deselect' : 'highlight'} ${upgrade.name}`}
          >
            <p className="text-xs text-muted-foreground truncate">{upgrade.name}</p>
            <div className="flex items-end justify-between mt-1">
              <span className="text-xl font-semibold text-foreground">{upgrade.value}</span>
              <span className="text-xs text-muted-foreground">{percentage.toFixed(0)}%</span>
            </div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-500" 
                style={{ width: `${percentage}%`, backgroundColor: upgrade.fill }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ColorPreferencesWidgetProps {
  lvpData: { name: string; value: number }[];
  carpetData: { name: string; value: number }[];
}

export function ColorPreferencesWidget({ lvpData, carpetData }: ColorPreferencesWidgetProps) {
  const [activeTab, setActiveTab] = useState<'lvp' | 'carpet'>('lvp');
  const data = activeTab === 'lvp' ? lvpData : carpetData;

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-2 mb-3">
        <Button
          variant={activeTab === 'lvp' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('lvp')}
        >
          LVP Colors
        </Button>
        <Button
          variant={activeTab === 'carpet' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('carpet')}
        >
          Carpet Colors
        </Button>
      </div>
      <div className="flex-1 min-h-[150px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} 
                angle={-45} 
                textAnchor="end" 
                height={60}
              />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))', 
                  borderRadius: '8px' 
                }}
              />
              <Bar 
                dataKey="value" 
                fill={activeTab === 'lvp' ? 'hsl(var(--primary))' : 'hsl(var(--accent))'} 
                radius={[4, 4, 0, 0]} 
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No {activeTab === 'lvp' ? 'LVP' : 'carpet'} color data yet
          </div>
        )}
      </div>
    </div>
  );
}
