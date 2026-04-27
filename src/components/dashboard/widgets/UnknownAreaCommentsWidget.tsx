import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AREA_DEFINITIONS } from '@/lib/upgradeCostData';
import { cn } from '@/lib/utils';

interface FlaggedEntry {
  submissionId: string;
  unitNumber: string;
  buyerName: string;
  areaId: string;
  materialType: string;
  comment: string;
  reason: 'unknown_area' | 'placeholder_area' | 'missing_area';
}

interface FlaggedSubmission {
  submissionId: string;
  unitNumber: string;
  buyerName: string;
  entries: FlaggedEntry[];
}

const KNOWN_AREA_IDS = new Set(AREA_DEFINITIONS.map((a) => a.id));

function classifyArea(areaId: unknown): FlaggedEntry['reason'] | null {
  if (typeof areaId !== 'string' || areaId.trim() === '') return 'missing_area';
  if (areaId.startsWith('unspecified_area')) return 'placeholder_area';
  if (!KNOWN_AREA_IDS.has(areaId)) return 'unknown_area';
  return null;
}

const REASON_LABEL: Record<FlaggedEntry['reason'], string> = {
  unknown_area: 'Unknown area ID',
  placeholder_area: 'Placeholder area',
  missing_area: 'Missing area ID',
};

export function UnknownAreaCommentsWidget() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<
    {
      id: string;
      unit_number: string;
      first_name: string | null;
      last_name: string | null;
      area_upgrades: any;
    }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('id, unit_number, first_name, last_name, area_upgrades')
        .order('created_at', { ascending: false });
      if (!cancelled) {
        if (!error && data) setRows(data as any);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flagged: FlaggedSubmission[] = useMemo(() => {
    const out: FlaggedSubmission[] = [];
    for (const row of rows) {
      const upgrades = Array.isArray(row.area_upgrades) ? row.area_upgrades : [];
      const entries: FlaggedEntry[] = [];
      upgrades.forEach((u: any) => {
        const comment = typeof u?.comments === 'string' ? u.comments.trim() : '';
        if (!comment) return;
        const reason = classifyArea(u?.areaId);
        if (!reason) return;
        entries.push({
          submissionId: row.id,
          unitNumber: row.unit_number,
          buyerName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
          areaId: typeof u?.areaId === 'string' ? u.areaId : '(empty)',
          materialType: typeof u?.materialType === 'string' ? u.materialType : '',
          comment,
          reason,
        });
      });
      if (entries.length > 0) {
        out.push({
          submissionId: row.id,
          unitNumber: row.unit_number,
          buyerName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
          entries,
        });
      }
    }
    return out;
  }, [rows]);

  const totalEntries = flagged.reduce((sum, s) => sum + s.entries.length, 0);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Scanning submissions…
      </div>
    );
  }

  if (flagged.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <FileSearch className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">All area-upgrade comments matched</p>
        <p className="text-xs">No unknown area classifications found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <span className="text-sm font-medium text-foreground">
            {flagged.length} submission{flagged.length === 1 ? '' : 's'} need review
          </span>
        </div>
        <Badge variant="outline" className="text-xs">
          {totalEntries} entr{totalEntries === 1 ? 'y' : 'ies'}
        </Badge>
      </div>

      <div className="flex-1 space-y-2 overflow-auto pr-1">
        {flagged.slice(0, 8).map((sub) => (
          <div
            key={sub.submissionId}
            className={cn(
              'p-3 rounded-lg border border-warning/30 bg-warning/5 hover:bg-warning/10 transition-colors cursor-pointer'
            )}
            onClick={() => navigate(`/admin/submissions?id=${sub.submissionId}`)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  Unit {sub.unitNumber}
                  <span className="ml-2 text-muted-foreground font-normal">
                    {sub.buyerName || '—'}
                  </span>
                </p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            </div>
            <ul className="mt-2 space-y-1">
              {sub.entries.slice(0, 3).map((e, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                      {REASON_LABEL[e.reason]}
                    </Badge>
                    <code className="font-mono text-[11px] text-foreground/80">
                      {e.areaId || '(empty)'}
                    </code>
                    {e.materialType && (
                      <span className="text-[11px]">· {e.materialType}</span>
                    )}
                  </span>
                  <p className="mt-0.5 line-clamp-2 italic">"{e.comment}"</p>
                </li>
              ))}
              {sub.entries.length > 3 && (
                <li className="text-[11px] text-muted-foreground">
                  +{sub.entries.length - 3} more entries
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>

      {flagged.length > 8 && (
        <div className="pt-2 border-t border-border mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => navigate('/admin/submissions')}
          >
            View all {flagged.length} flagged submissions
          </Button>
        </div>
      )}
    </div>
  );
}
