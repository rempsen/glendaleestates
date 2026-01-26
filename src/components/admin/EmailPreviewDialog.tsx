import { useState } from 'react';
import { Eye, Send, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailHtml: string;
  recipientEmail: string;
  subject: string;
  onSend: () => Promise<void>;
  sending?: boolean;
}

export function EmailPreviewDialog({
  open,
  onOpenChange,
  emailHtml,
  recipientEmail,
  subject,
  onSend,
  sending = false,
}: EmailPreviewDialogProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'source'>('preview');

  const handleSend = async () => {
    await onSend();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Email Preview
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">To:</span>
            <Badge variant="outline">{recipientEmail}</Badge>
            <span className="text-muted-foreground">|</span>
            <span className="font-medium">Subject:</span>
            <span className="text-foreground">{subject}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preview' | 'source')} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="preview">Visual Preview</TabsTrigger>
            <TabsTrigger value="source">HTML Source</TabsTrigger>
          </TabsList>
          
          <TabsContent value="preview" className="flex-1 min-h-0 mt-0">
            <div className="border rounded-lg bg-white overflow-hidden h-[500px]">
              <iframe
                srcDoc={emailHtml}
                className="w-full h-full"
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="source" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[500px] border rounded-lg">
              <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
                {emailHtml}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
