import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageSquare, Save, X, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface AdminNotesSectionProps {
  submissionId: string;
  adminNotes: string | null;
  salesComments: string | null;
  onUpdate: (notes: { admin_notes: string | null; sales_comments: string | null }) => void;
}

export function AdminNotesSection({ 
  submissionId, 
  adminNotes, 
  salesComments,
  onUpdate 
}: AdminNotesSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState(adminNotes || '');
  const [comments, setComments] = useState(salesComments || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('buyer_selections')
        .update({
          admin_notes: notes || null,
          sales_comments: comments || null,
        })
        .eq('id', submissionId);

      if (error) throw error;

      onUpdate({ admin_notes: notes || null, sales_comments: comments || null });
      setIsEditing(false);
      toast.success('Notes saved successfully');
    } catch (error: any) {
      toast.error('Failed to save notes', {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(adminNotes || '');
    setComments(salesComments || '');
    setIsEditing(false);
  };

  const hasNotes = adminNotes || salesComments;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h4 className="font-semibold text-foreground">Internal Notes</h4>
        </div>
        {!isEditing && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            {hasNotes ? (
              <>Edit Notes</>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-1" />
                Add Notes
              </>
            )}
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="admin_notes">Admin Notes</Label>
            <Textarea
              id="admin_notes"
              placeholder="Internal notes about this submission (not visible to buyer)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Private notes for BMD staff only
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sales_comments">Sales Comments</Label>
            <Textarea
              id="sales_comments"
              placeholder="Sales-related comments and follow-up notes..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Comments for sales team reference
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCancel}
              disabled={saving}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save Notes
            </Button>
          </div>
        </div>
      ) : hasNotes ? (
        <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
          {adminNotes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Admin Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{adminNotes}</p>
            </div>
          )}
          {salesComments && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Sales Comments</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{salesComments}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-lg border border-dashed border-border bg-muted/20 text-center">
          <p className="text-sm text-muted-foreground">
            No internal notes yet. Click "Add Notes" to add comments.
          </p>
        </div>
      )}
    </div>
  );
}