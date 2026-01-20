interface QuickStatsWidgetProps {
  stats: {
    label: string;
    value: string | number;
  }[];
}

export function QuickStatsWidget({ stats }: QuickStatsWidgetProps) {
  return (
    <div className="h-full grid grid-cols-3 sm:grid-cols-6 gap-2">
      {stats.map((stat, index) => (
        <div 
          key={index} 
          className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-center cursor-pointer"
        >
          <p className="text-lg sm:text-xl font-serif font-semibold text-foreground">{stat.value}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
