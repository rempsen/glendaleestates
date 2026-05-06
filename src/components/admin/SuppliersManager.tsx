// =====================================================================
// Admin-managed list of suppliers used by the Project Management dropdowns.
// =====================================================================
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
}

const empty = (): Partial<Supplier> => ({
  name: '', contact_name: '', contact_email: '', contact_phone: '', notes: '', is_active: true,
});

export function SuppliersManager({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Supplier>>(empty());

  const load = async () => {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setItems((data || []) as Supplier[]);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.name?.trim()) return toast.error('Name is required');
    const payload = { ...editing, name: editing.name.trim() };
    const { error } = editing.id
      ? await supabase.from('suppliers').update(payload).eq('id', editing.id)
      : await supabase.from('suppliers').insert(payload as Supplier);
    if (error) return toast.error(error.message);
    toast.success('Supplier saved');
    setOpen(false);
    setEditing(empty());
    await load();
    onChange?.();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this supplier?')) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) return toast.error(error.message);
    await load();
    onChange?.();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Suppliers</h3>
          <p className="text-xs text-muted-foreground">Used by all project-management dropdowns.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(empty()); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Supplier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing.id ? 'Edit' : 'New'} Supplier</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div><Label>Name *</Label><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact Name</Label><Input value={editing.contact_name ?? ''} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} /></div>
                <div><Label>Contact Phone</Label><Input value={editing.contact_phone ?? ''} onChange={(e) => setEditing({ ...editing, contact_phone: e.target.value })} /></div>
              </div>
              <div><Label>Contact Email</Label><Input type="email" value={editing.contact_email ?? ''} onChange={(e) => setEditing({ ...editing, contact_email: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea rows={2} value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="divide-y border rounded-md">
        {items.length === 0 && <div className="p-3 text-sm text-muted-foreground">No suppliers yet.</div>}
        {items.map((s) => (
          <div key={s.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm">{s.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {[s.contact_name, s.contact_email, s.contact_phone].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
