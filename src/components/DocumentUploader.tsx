import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, X, FileText, Image, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export interface UploadedDocument {
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface DocumentUploaderProps {
  unitNumber: string;
  uploads: UploadedDocument[];
  onUploadsChange: (uploads: UploadedDocument[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.doc', '.docx'];

export function DocumentUploader({
  unitNumber,
  uploads,
  onUploadsChange,
  maxFiles = 5,
  maxSizeMB = 10,
}: DocumentUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const validateFile = (file: File): string | null => {
    const maxBytes = maxSizeMB * 1024 * 1024;
    
    if (file.size > maxBytes) {
      return `File "${file.name}" exceeds ${maxSizeMB}MB limit`;
    }
    
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
      return `File "${file.name}" has an unsupported format. Allowed: PDF, JPG, PNG, WEBP, DOC, DOCX`;
    }
    
    return null;
  };

  const uploadFile = async (file: File): Promise<UploadedDocument | null> => {
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Please sign in to upload documents');
    const path = `${user.id}/${unitNumber}/${timestamp}-${sanitizedName}`;

    const { error } = await supabase.storage
      .from('buyer-documents')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error(`Failed to upload ${file.name}: ${error.message}`);
    }

    return {
      name: file.name,
      path,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    };
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    if (uploads.length + fileArray.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    // Validate all files first
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }
    }

    setIsUploading(true);
    const newUploads: UploadedDocument[] = [];

    try {
      for (const file of fileArray) {
        const uploaded = await uploadFile(file);
        if (uploaded) {
          newUploads.push(uploaded);
        }
      }

      onUploadsChange([...uploads, ...newUploads]);
      toast.success(`${newUploads.length} file${newUploads.length > 1 ? 's' : ''} uploaded`);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [uploads, onUploadsChange, maxFiles, unitNumber]);

  const handleRemove = async (index: number) => {
    const doc = uploads[index];
    
    try {
      const { error } = await supabase.storage
        .from('buyer-documents')
        .remove([doc.path]);
      
      if (error) {
        console.error('Delete error:', error);
      }
      
      const newUploads = uploads.filter((_, i) => i !== index);
      onUploadsChange(newUploads);
      toast.info('File removed');
    } catch (error) {
      console.error('Failed to remove file:', error);
      toast.error('Failed to remove file');
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) {
      return <Image className="w-5 h-5 text-primary" />;
    }
    return <FileText className="w-5 h-5 text-primary" />;
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all ${
          dragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-border bg-secondary/30 hover:border-primary/50'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading || uploads.length >= maxFiles}
        />
        
        <div className="flex flex-col items-center gap-2">
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium text-foreground">
              {isUploading ? 'Uploading...' : 'Drop files here or click to upload'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF, JPG, PNG, DOC up to {maxSizeMB}MB • Max {maxFiles} files
            </p>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
        <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-muted-foreground">
          Attach any relevant drawings, floor plans, or other documents that may help with your selections. 
          These will be included with your submission and sent to the BMD team.
        </p>
      </div>

      {/* Uploaded Files */}
      <AnimatePresence>
        {uploads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <p className="text-sm font-medium text-foreground">
              Uploaded Documents ({uploads.length}/{maxFiles})
            </p>
            {uploads.map((doc, index) => (
              <motion.div
                key={doc.path}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                {getFileIcon(doc.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(doc.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
