// Unit documents in the meeting console (Phase 2 Task 14, spec §6.8): list, upload an external PDF, send the current
// quote for signature (snapshot → buyer PDF → SignWell embedded signing), download via short-lived signed URLs.
// Files live in the private bucket unit-documents/{unit_number}/{document_id}.pdf (staff storage policy, 0006).
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type { QuoteLine } from '@/lib/quoteLines';
import { generateSnapshotBuyerPdf } from '@/lib/savedSubmissionPdf';
import { sendForSignature, snapshotRefusal } from '@/lib/esignSend';
import {
  DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, UNIT_DOCUMENTS_BUCKET, unitDocumentPath, isDocumentKind,
  type DocumentKind, type SnapshotPurpose,
} from '@shared/esign/documents';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type DocRow = Tables<'documents'> & { snapshot: { version: number } | null };

const PURPOSES: Array<{ value: SnapshotPurpose; label: string }> = [
  { value: 'quote', label: 'Selection sheet (quote)' },
  { value: 'change_order', label: 'Change order' },
  { value: 'contract', label: 'Purchase agreement' },
];

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', sent: 'bg-amber-100 text-amber-900', signed: 'bg-emerald-100 text-emerald-900',
  declined: 'bg-red-100 text-red-900', voided: 'bg-red-100 text-red-900',
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const kindLabel = (k: string) => (isDocumentKind(k) ? DOCUMENT_KIND_LABELS[k] : k);

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Error text from a functions.invoke failure (the function's JSON `error` when there is one). */
async function invokeErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  try {
    const j = await ctx?.json?.() as { error?: unknown } | undefined;
    if (j && typeof j.error === 'string') return j.error;
  } catch { /* fall through */ }
  return error instanceof Error ? error.message : String(error);
}

/** Identity only: the PDF header is re-read from buyer_selections at send time (fresh record, AGENTS rule 1). */
export interface DocumentsPanelSubmission { id: string; unit_number: string; email: string | null }

/** Fresh buyer_selections row for the snapshot PDF header (never the console's render-state copy). */
async function loadSubmissionRow(id: string): Promise<Tables<'buyer_selections'>> {
  const { data, error } = await supabase.from('buyer_selections').select('*').eq('id', id).single();
  if (error || !data) throw error ?? new Error('Submission not found');
  return data;
}

export interface DocumentsPanelProps {
  submission: DocumentsPanelSubmission | null;
  lines: QuoteLine[];
  gstRate: number | null | undefined;
  /** The console's guard: commit the focused cell, flush autosave, refuse when anything is unsaved. */
  flushSaved: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Reads lines / GST after the flush (store, not render state). */
  current: () => { lines: QuoteLine[]; gstRate: number | null | undefined };
  /** Set while the quote is not itemised (or lines are loading): upload and send are disabled with this reason. */
  lockedReason?: string | null;
}

export function DocumentsPanel({ submission, lines, gstRate, flushSaved, current, lockedReason = null }: DocumentsPanelProps) {
  const submissionId = submission?.id ?? null;
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<DocumentKind>('purchase_agreement');
  const [uploadSigned, setUploadSigned] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [purpose, setPurpose] = useState<SnapshotPurpose>('quote');
  const [signingUrl, setSigningUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!submissionId) return;
    const { data, error } = await supabase
      .from('documents').select('*, snapshot:quote_snapshots(version)')
      .eq('submission_id', submissionId).order('created_at', { ascending: false });
    if (error) { setLoadError(error.message); return; }
    setLoadError(null);
    setDocs((data ?? []) as unknown as DocRow[]);
  }, [submissionId]);

  useEffect(() => { void load(); }, [load]);

  const download = async (d: DocRow) => {
    if (!d.storage_path) return;
    const win = window.open('', '_blank'); // opened in the gesture so iPad Safari does not block it
    const { data, error } = await supabase.storage.from(UNIT_DOCUMENTS_BUCKET).createSignedUrl(d.storage_path, 60);
    if (error || !data?.signedUrl) {
      if (win) win.close();
      toast.error('Could not open the file', { description: error?.message });
      return;
    }
    if (win && !win.closed) win.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank');
  };

  const uploadExternal = async () => {
    const file = fileRef.current?.files?.[0];
    if (!submission || !file) { toast.error('Choose a PDF first'); return; }
    if (file.type && file.type !== 'application/pdf') { toast.error('Only PDF files can be uploaded'); return; }
    setBusy('upload');
    try {
      const id = crypto.randomUUID();
      const path = unitDocumentPath(submission.unit_number, id);
      const up = await supabase.storage.from(UNIT_DOCUMENTS_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (up.error) throw up.error;
      const ins = await supabase.from('documents').insert({
        id, submission_id: submission.id, snapshot_id: null, kind: uploadKind, storage_path: path,
        status: uploadSigned ? 'signed' : 'draft', signed_at: uploadSigned ? new Date().toISOString() : null,
        uploaded_by: await currentUserId(),
      });
      if (ins.error) {
        // Best effort: since 0016 staff have no storage DELETE, so this is refused and the file stays at a path no
        // documents row references (harmless; an admin can clear it in the dashboard).
        await supabase.storage.from(UNIT_DOCUMENTS_BUCKET).remove([path]);
        throw ins.error;
      }
      toast.success('Document uploaded');
      setUploadOpen(false);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) {
      toast.error('Upload failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const callSend = async (documentId: string): Promise<{ embedded_signing_url: string }> => {
    const { data, error } = await supabase.functions.invoke('send-for-signature', { body: { document_id: documentId } });
    if (error) throw new Error(await invokeErrorMessage(error));
    const url = (data as { embedded_signing_url?: unknown })?.embedded_signing_url;
    if (typeof url !== 'string' || !url) throw new Error('No signing link was returned');
    return { embedded_signing_url: url };
  };

  const send = async () => {
    if (!submission) return;
    setBusy('send');
    try {
      const userId = await currentUserId();
      const fresh = await loadSubmissionRow(submission.id);
      const r = await sendForSignature(
        { submissionId: fresh.id, unitNumber: fresh.unit_number, buyerEmail: fresh.email ?? null, purpose },
        {
          flushSaved,
          current,
          async existingVersions(sid) {
            const { data, error } = await supabase.from('quote_snapshots').select('version').eq('submission_id', sid);
            if (error) throw error;
            return (data ?? []).map((x) => x.version);
          },
          async insertSnapshot(row) {
            const { data, error } = await supabase.from('quote_snapshots')
              .insert({ ...row, lines: row.lines as never, created_by: userId }).select('id, version').single();
            if (error) throw error;
            return data;
          },
          renderBuyerPdf: (l, rate, version) => generateSnapshotBuyerPdf(fresh, l, rate, version),
          newId: () => crypto.randomUUID(),
          async insertDocument(row) {
            const { error } = await supabase.from('documents').insert({ ...row, uploaded_by: userId });
            if (error) throw error;
          },
          // Staff may void an unsigned draft but never DELETE a document (0016).
          async voidDraftDocument(id) { await supabase.from('documents').update({ status: 'voided' }).eq('id', id).eq('status', 'draft'); },
          async upload(path, pdf) {
            // A fresh path per document: plain INSERT (staff have no storage UPDATE since 0016; upsert would need it).
            const { error } = await supabase.storage.from(UNIT_DOCUMENTS_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
            if (error) throw error;
          },
          sendForSignature: callSend,
        },
      );
      if (r.ok === false) { toast.error('Not sent', { description: r.reason }); return; }
      setSendOpen(false);
      setSigningUrl(r.embeddedSigningUrl);
      toast.success(`Quote version ${r.snapshot.version} ready to sign`);
    } catch (e) {
      toast.error('Send for signature failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      void load();
    }
  };

  /** A draft whose PDF uploaded but whose send failed can be retried as-is (same snapshot, same file). */
  const resend = async (d: DocRow) => {
    setBusy(d.id);
    try {
      const r = await callSend(d.id);
      setSigningUrl(r.embedded_signing_url);
    } catch (e) {
      toast.error('Send for signature failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      void load();
    }
  };

  const copyLink = async () => {
    if (!signingUrl) return;
    try { await navigator.clipboard.writeText(signingUrl); toast.success('Signing link copied'); } catch { toast.error('Copy failed — select the link and copy it'); }
  };

  const refusal = snapshotRefusal(lines, gstRate);

  return (
    <Card id="documents">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3 pb-2">
        <CardTitle className="text-sm">Documents</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!submission || !!busy || !!lockedReason} title={lockedReason ?? undefined} onClick={() => setUploadOpen(true)}>Upload external PDF</Button>
          <Button size="sm" disabled={!submission || !!busy || !!lockedReason} title={lockedReason ?? refusal ?? undefined} onClick={() => setSendOpen(true)}>
            {busy === 'send' ? 'Sending…' : 'Send for signature'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 text-sm">
        {loadError && <p role="alert" className="text-destructive">Could not load documents: {loadError}</p>}
        {!docs.length && !loadError ? <p className="text-muted-foreground">No documents yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="py-1 pr-3">Kind</th><th className="pr-3">Status</th><th className="pr-3">Version</th><th className="pr-3">Created</th><th className="pr-3">Signed</th><th /></tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{kindLabel(d.kind)}{d.snapshot_id ? '' : <span className="text-xs text-muted-foreground"> · uploaded</span>}</td>
                    <td className="pr-3"><Badge variant="secondary" className={STATUS_STYLE[d.status] ?? ''}>{d.status}</Badge></td>
                    <td className="pr-3">{d.snapshot ? `v${d.snapshot.version}` : '—'}</td>
                    <td className="pr-3">{fmt(d.created_at)}</td>
                    <td className="pr-3">{fmt(d.signed_at)}</td>
                    <td className="whitespace-nowrap text-right">
                      {d.status === 'draft' && d.snapshot_id && d.storage_path && (
                        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void resend(d)}>{busy === d.id ? 'Sending…' : 'Send'}</Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={!d.storage_path} onClick={() => void download(d)}>Download</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload external PDF</DialogTitle>
            <DialogDescription>For documents signed outside the portal (paper or another tool).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="doc-kind">Kind</Label>
              <Select value={uploadKind} onValueChange={(v) => isDocumentKind(v) && setUploadKind(v)}>
                <SelectTrigger id="doc-kind"><SelectValue /></SelectTrigger>
                <SelectContent>{DOCUMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-file">PDF file</Label>
              <Input id="doc-file" ref={fileRef} type="file" accept="application/pdf,.pdf" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={uploadSigned} onCheckedChange={(v) => setUploadSigned(v === true)} />
              This copy is already signed
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button disabled={busy === 'upload'} onClick={() => void uploadExternal()}>{busy === 'upload' ? 'Uploading…' : 'Upload'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send for signature</DialogTitle>
            <DialogDescription>
              Saves the quote, freezes it as a new version, renders the client PDF from it and opens signing for
              {submission?.email ? ` ${submission.email}` : ' the buyer'}. Internal notes are never included.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="snap-purpose">Document</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as SnapshotPurpose)}>
              <SelectTrigger id="snap-purpose"><SelectValue /></SelectTrigger>
              <SelectContent>{PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {refusal && <p role="alert" className="text-sm text-destructive">{refusal}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button disabled={busy === 'send'} onClick={() => void send()}>{busy === 'send' ? 'Sending…' : 'Freeze and send'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!signingUrl} onOpenChange={(o) => { if (!o) { setSigningUrl(null); void load(); } }}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle>Buyer signing</DialogTitle>
            <DialogDescription>Hand the tablet to the buyer. If the frame stays blank, open or copy the link.</DialogDescription>
          </DialogHeader>
          {signingUrl && <iframe title="Signing" src={signingUrl} className="min-h-0 w-full flex-1 rounded border border-border" allow="clipboard-write" />}
          <DialogFooter className="gap-2 sm:justify-between">
            <Input readOnly value={signingUrl ?? ''} onFocus={(e) => e.currentTarget.select()} className="text-xs" aria-label="Signing link" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void copyLink()}>Copy link</Button>
              <Button variant="outline" onClick={() => signingUrl && window.open(signingUrl, '_blank', 'noopener')}>Open in new tab</Button>
              <Button onClick={() => { setSigningUrl(null); void load(); }}>Done</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
