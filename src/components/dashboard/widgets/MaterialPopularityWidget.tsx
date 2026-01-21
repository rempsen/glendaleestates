import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface MaterialData {
  name: string;
  count: number;
  percentage: number;
}

interface MaterialPopularityWidgetProps {
  lvpColors: MaterialData[];
  carpetColors: MaterialData[];
  backsplashOrientations: MaterialData[];
  totalSubmissions: number;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  'hsl(var(--accent))',
];

export function MaterialPopularityWidget({ 
  lvpColors, 
  carpetColors, 
  backsplashOrientations,
  totalSubmissions 
}: MaterialPopularityWidgetProps) {
  const [activeTab, setActiveTab] = useState('lvp');

  const renderChart = (data: MaterialData[]) => {
    if (data.length === 0) {
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          No data available
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        <ResponsiveContainer width="100%" height="60%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={10} />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={80} 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Selections']}
              labelFormatter={(label) => label}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        
        {/* Legend with counts */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-2 pt-2">
            {data.slice(0, 6).map((item, index) => (
              <div 
                key={item.name}
                className="flex items-center gap-2 text-xs"
              >
                <div 
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="truncate text-muted-foreground">{item.name}</span>
                <span className="font-medium ml-auto">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-3 h-8">
        <TabsTrigger value="lvp" className="text-xs">LVP Colors</TabsTrigger>
        <TabsTrigger value="carpet" className="text-xs">Carpet</TabsTrigger>
        <TabsTrigger value="backsplash" className="text-xs">Backsplash</TabsTrigger>
      </TabsList>
      
      <TabsContent value="lvp" className="flex-1 mt-3">
        {renderChart(lvpColors)}
      </TabsContent>
      
      <TabsContent value="carpet" className="flex-1 mt-3">
        {renderChart(carpetColors)}
      </TabsContent>
      
      <TabsContent value="backsplash" className="flex-1 mt-3">
        {renderChart(backsplashOrientations)}
      </TabsContent>
      
      <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
        Based on {totalSubmissions} total submissions
      </div>
    </Tabs>
  );
}