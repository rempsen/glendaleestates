import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Check, Home, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DraftSaved() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <Logo />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          {/* Success Icon */}
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-success" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-foreground mb-3">
            Draft Saved Successfully
          </h1>

          {/* Description */}
          <p className="text-muted-foreground mb-8">
            Your progress has been saved. You can sign back in anytime to continue where you left off. Your selections will be waiting for you.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate('/')} className="gap-2">
              <Home className="w-4 h-4" />
              Go to Home
            </Button>
            <Button onClick={() => navigate('/buyer-auth')} className="gap-2">
              <LogIn className="w-4 h-4" />
              Sign Back In
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
