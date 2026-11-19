// Meeting console (Phase 2 Task 8, spec §6.10 + §6.16): the one screen where staff rework a buyer's quote with the
// buyer beside them. Lines edit inline and autosave (useQuoteLines); RunningTotal is the only place totals render;
// every preview / export / navigation goes through guardedAction (flush first, refuse while unsaved).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { useQuoteLines } from '@/hooks/useQuoteLines';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { SECTION_ORDER, type LineStatus, type Section } from '@/lib/quoteLines';
import type { LinePatch, StoredLine } from '@/lib/quoteLinesReducer';
import { baseSpecFor } from '@/lib/baseSpec';
import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';
import { parseCustomPricing } from '@/lib/upgradeTotals';
import { presetSourceFromDynamic, SECTION_LABELS, type LineDraft, type PresetPerson } from '@/lib/addLinePresets';
import { needsReason, validateStatusChange, STATUS_OPTIONS } from '@/lib/statusChange';
import { guardedAction } from '@/lib/guardedAction';
import { RECIPIENTS_KEY, parseStoredRecipients } from '@/lib/notificationRecipients';
import { openClientPreview, downloadBuyerPdf, downloadWord } from '@/lib/consoleRenderers';
import type { SubmissionEditState } from '@/lib/submissionUpdatePayload';
import { ConsoleHeader, type ConsoleAction } from '@/components/quote/ConsoleHeader';
import { SectionGroup } from '@/components/quote/SectionGroup';
import { isSaveKey, sectionAnchor } from '@/components/quote/consoleCells';
import { AddLineMenu } from '@/components/quote/AddLineMenu';
import { NotesPanels } from '@/components/quote/NotesPanels';
import { RunningTotal } from '@/components/quote/RunningTotal';
import { SubmissionEditor } from '@/components/admin/SubmissionEditor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Row = SubmissionEditState & {
  id: string; unit_number: string; first_name: string; last_name: string; unit_type: string | null;
  estimated_possession_date?: string | null; status?: string | null; custom_pricing?: unknown;
};

interface ReasonPrompt { line: StoredLine; to: LineStatus; note: string; error: string | null }

/** Staff and admins who can be flagged (profiles joined to user_roles). */
async function loadPeople(): Promise<PresetPerson[]> {
  const { data: roles } = await supabase.from('user_roles').select('user_id, role').in('role', ['admin', 'staff']);
  const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
  if (!ids.length) return [];
  const { data: profs } = await supabase.from('profiles').select('user_id, first_name, last_name, email').in('user_id', ids);
  return (profs ?? [])
    .map((p) => ({
      user_id: p.user_id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Staff member',
      email: p.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadRecipients(): Promise<string[] | null> {
  const { data, error } = await supabase.from('portal_settings' as never).select('value').eq('key', RECIPIENTS_KEY).maybeSingle();
  if (error || !data) return null; // admin-only table: staff simply get no default assignee
  return parseStoredRecipients((data as { value: unknown }).value);
}

export default function QuoteConsole() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<Row | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [people, setPeople] = useState<PresetPerson[]>([]);
  const [recipients, setRecipients] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<ConsoleAction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [prompt, setPrompt] = useState<ReasonPrompt | null>(null);

  const unitLabel = row ? `Unit ${row.unit_number}` : undefined;
  const q = useQuoteLines(id, { unitLabel });
  const dyn = useDynamicPricing();

  const loadRow = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('buyer_selections').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setRowError(error?.message ?? 'Quote not found'); return; }
    setRowError(null);
    setRow({ ...data, area_upgrades: Array.isArray(data.area_upgrades) ? data.area_upgrades : [] } as unknown as Row);
  }, [id]);

  useEffect(() => { void loadRow(); }, [loadRow]);
  useEffect(() => {
    void loadPeople().then(setPeople).catch(() => setPeople([]));
    void loadRecipients().then(setRecipients).catch(() => setRecipients(null));
  }, []);

  const unitCode = row?.unit_type ? normalizeUnitTypeCode(row.unit_type) : null;
  const baseSpec = useMemo(() => baseSpecFor(unitCode), [unitCode]);
  const presetSource = useMemo(
    () => (dyn.loaded && !dyn.error ? presetSourceFromDynamic(dyn as never, unitCode) : null),
    [dyn, unitCode],
  );
  const followUps = useMemo(() => parseCustomPricing(row?.custom_pricing).followUps ?? [], [row?.custom_pricing]);

  const bySection = useMemo(() => {
    const m = new Map<Section, StoredLine[]>(SECTION_ORDER.map((s) => [s, []]));
    for (const l of q.lines) if (l.status !== 'removed') m.get(l.section)?.push(l);
    return m;
  }, [q.lines]);

  // ⌘/Ctrl+S saves now. Cells commit their draft on the same keydown before this handler runs.
  const { flush } = q;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSaveKey(e)) {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush]);

  /** Flush, then run only if every line saved (Review Focus 1). Refusals toast the reason. */
  const guarded = useCallback(async (what: ConsoleAction | null, run: () => Promise<void> | void): Promise<boolean> => {
    setBusy(what);
    try {
      const r = await guardedAction({ flush: q.flush, snapshot: q.snapshot }, run);
      if (r.ok === false) toast.error('Not yet — changes are not saved', { description: r.reason });
      return r.ok;
    } catch (e) {
      toast.error('That did not work', { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [q.flush, q.snapshot]);

  const onPreview = () => {
    if (!id) return;
    const win = window.open('', '_blank'); // open now (user gesture) so Safari does not block it after the await
    void guarded('preview', () => openClientPreview(id, win)).then((ok) => { if (!ok && win && !win.closed) win.close(); });
  };
  const onWord = () => { if (id) void guarded('word', () => downloadWord(id)); };
  const onPdf = () => { if (id) void guarded('pdf', () => downloadBuyerPdf(id)); };
  const onBack = () => { void guarded(null, () => navigate('/admin/quotes')); };

  const patch = useCallback((lineId: string, p: LinePatch) => { q.upsert({ id: lineId, ...p }); }, [q]);

  const changeStatus = useCallback((line: StoredLine, to: LineStatus) => {
    if (to === line.status) return;
    if (needsReason(to)) { setPrompt({ line, to, note: line.client_note ?? '', error: null }); return; }
    const r = validateStatusChange(line.status, to, line.client_note);
    if (r.ok === false) { toast.error(r.reason); return; }
    q.upsert({ id: line.id, status: to });
  }, [q]);

  const confirmReason = () => {
    if (!prompt) return;
    const r = validateStatusChange(prompt.line.status, prompt.to, prompt.note);
    if (r.ok === false) { setPrompt({ ...prompt, error: r.reason }); return; }
    q.upsert({ id: prompt.line.id, status: prompt.to, client_note: r.clientNote });
    setPrompt(null);
  };

  const removeLine = useCallback((line: StoredLine) => {
    const before = line.status;
    // A line never saved is dropped locally by remove(); undo re-creates it instead of editing a missing id.
    const neverSaved = line.updated_at === '';
    q.remove(line.id);
    const undo = () => {
      if (!neverSaved) { q.upsert({ id: line.id, status: before }); return; }
      const { id: _id, submission_id: _s, updated_at: _u, created_at: _c, counts_in_total: _t, ...fields } = line;
      q.createLine(fields);
    };
    toast(`Removed: ${line.label}`, { description: line.location || undefined, action: { label: 'Undo', onClick: undo } });
  }, [q]);

  /** Move within the section by swapping with its neighbour in the global order. */
  const moveLine = useCallback((line: StoredLine, dir: -1 | 1) => {
    const list = bySection.get(line.section) ?? [];
    const neighbour = list[list.indexOf(line) + dir];
    if (!neighbour) return;
    const ids = q.lines.map((l) => l.id);
    const a = ids.indexOf(line.id); const b = ids.indexOf(neighbour.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    q.reorder(ids);
  }, [bySection, q]);

  const createLine = useCallback((draft: LineDraft) => {
    if (q.loading) { toast.error('Lines are still loading — try again in a moment.'); return; }
    q.createLine(draft);
  }, [q]);

  if (!id) return null;
  const addDisabled = q.loading || !!q.loadError;

  return (
    <AdminLayout>
      <div className="pb-24 xl:pb-0">
        <ConsoleHeader
          unitNumber={row?.unit_number ?? null}
          buyerName={row ? `${row.first_name} ${row.last_name}`.trim() : ''}
          unitType={row?.unit_type ?? null}
          possession={row?.estimated_possession_date ?? null}
          status={row?.status ?? null}
          busy={busy}
          outputsDisabled={q.loading || !!q.loadError || !row}
          onBack={onBack}
          onPreview={onPreview}
          onWord={onWord}
          onPdf={onPdf}
          onEditBuyer={() => setEditOpen(true)}
        />

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            {rowError && <p role="alert" className="text-sm text-destructive">{rowError}</p>}
            {q.loadError && (
              <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
                Could not load lines: {q.loadError}
                <Button size="sm" variant="outline" onClick={() => void q.refresh()}>Retry</Button>
              </div>
            )}
            <nav aria-label="Sections" className="flex flex-wrap gap-1.5 text-xs">
              {SECTION_ORDER.map((s) => (
                <button
                  key={s} type="button"
                  className="rounded-full border border-border bg-background px-2.5 py-1 hover:bg-muted"
                  onClick={() => document.getElementById(sectionAnchor(s))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {SECTION_LABELS[s]}{bySection.get(s)?.length ? ` · ${bySection.get(s)?.length}` : ''}
                </button>
              ))}
            </nav>
            {q.loading && !q.lines.length && <p className="text-sm text-muted-foreground">Loading lines…</p>}

            {SECTION_ORDER.map((s) => (
              <SectionGroup
                key={s}
                section={s}
                lines={bySection.get(s) ?? []}
                people={people}
                onPatch={patch}
                onStatusChange={changeStatus}
                onRemove={removeLine}
                onMove={moveLine}
                addMenu={(
                  <AddLineMenu
                    section={s} source={presetSource} baseSpec={baseSpec} people={people} recipients={recipients}
                    disabled={addDisabled} onCreate={createLine}
                  />
                )}
              />
            ))}

            <NotesPanels lines={q.lines} followUps={followUps} />
          </div>

          {/* Rail on wide screens; at iPad landscape (1024) and below it collapses to the bottom total bar. */}
          <div className="hidden shrink-0 xl:block">
            <RunningTotal lines={q.lines} gstRate={dyn.gstRate} buyerView={false} saveState={q.saveState} onRetry={() => void q.flush()} variant="desktop" headerHeight="0px" />
          </div>
          <div className="xl:hidden">
            <RunningTotal lines={q.lines} gstRate={dyn.gstRate} buyerView={false} saveState={q.saveState} onRetry={() => void q.flush()} variant="mobile" />
          </div>
        </div>
      </div>

      <Dialog open={!!prompt} onOpenChange={(o) => { if (!o) setPrompt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{STATUS_OPTIONS.find((o) => o.value === prompt?.to)?.label}: reason for the buyer</DialogTitle>
            <DialogDescription>
              {prompt ? `${prompt.line.location ? `${prompt.line.location} · ` : ''}${prompt.line.label}. ` : ''}
              This note prints on the quote; the line stays out of the total.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); confirmReason(); }}>
            <Label htmlFor="status-reason">Client note (printed)</Label>
            <Textarea
              id="status-reason" autoFocus rows={3} value={prompt?.note ?? ''}
              onChange={(e) => prompt && setPrompt({ ...prompt, note: e.target.value, error: null })}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); confirmReason(); } }}
            />
            {prompt?.error && <p role="alert" className="text-sm text-destructive">{prompt.error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPrompt(null)}>Cancel</Button>
              <Button type="submit">Set status</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Edit buyer details</DialogTitle>
            <DialogDescription>Buyer identity and wizard answers. Quote lines are edited in the console.</DialogDescription>
          </DialogHeader>
          {row && (
            <SubmissionEditor
              buyerDetailsOnly
              submission={row}
              onSaved={(updated) => { setRow({ ...row, ...updated } as Row); void q.flush().then(q.refresh); }}
              onSave={() => setEditOpen(false)}
              onCancel={() => setEditOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
