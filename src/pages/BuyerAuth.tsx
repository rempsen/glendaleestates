import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { Mail, Lock, ArrowRight, UserPlus, LogIn, ArrowLeft, KeyRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { z } from 'zod';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().optional(),
});

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

export default function BuyerAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>(() => 
    searchParams.get('mode') === 'signin' ? 'signin' : 'signup'
  );

  useEffect(() => {
    // Check if this is a password reset callback
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    
    if (type === 'recovery') {
      setMode('reset');
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
        return;
      }
      if (session && mode !== 'reset') {
        navigate('/select');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && mode !== 'reset') {
        navigate('/select');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, mode]);

  const validateForm = () => {
    if (mode === 'forgot') {
      if (!email || !email.includes('@')) {
        toast.error('Please enter a valid email address');
        return false;
      }
      return true;
    }

    if (mode === 'reset') {
      if (!password || password.length < 6) {
        toast.error('Password must be at least 6 characters');
        return false;
      }
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return false;
      }
      return true;
    }

    try {
      authSchema.parse({ email, password });
      
      if (mode === 'signup' && password !== confirmPassword) {
        toast.error('Passwords do not match', {
          description: 'Please ensure both password fields are identical.',
        });
        return false;
      }
      
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return false;
    }
  };

  const handleForgotPassword = async () => {
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/buyer-auth`,
      });
      
      if (error) throw error;
      
      toast.success('Password reset email sent!', {
        description: 'Check your inbox for the reset link.',
      });
      setMode('signin');
    } catch (error: unknown) {
      toast.error('Failed to send reset email', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });
      
      if (error) throw error;
      
      toast.success('Password updated successfully!', {
        description: 'You can now sign in with your new password.',
      });
      
      // Sign out and redirect to login
      await supabase.auth.signOut();
      setMode('signin');
      setPassword('');
      setConfirmPassword('');
      
      // Clear the URL hash
      window.history.replaceState(null, '', window.location.pathname);
    } catch (error: unknown) {
      toast.error('Failed to reset password', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    if (mode === 'forgot') {
      return handleForgotPassword();
    }

    if (mode === 'reset') {
      return handleResetPassword();
    }
    
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/select`,
          },
        });
        
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('This email is already registered', {
              description: 'Please sign in instead, or use a different email.',
            });
            setMode('signin');
          } else {
            throw error;
          }
        } else {
          toast.success('Account created successfully!', {
            description: 'You can now continue with your selections.',
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) {
          if (error.message.includes('Invalid login')) {
            toast.error('Invalid email or password', {
              description: 'Please check your credentials and try again.',
            });
          } else {
            throw error;
          }
        } else {
          toast.success('Welcome back!', {
            description: 'Your previous selections have been saved.',
          });
        }
      }
    } catch (error: unknown) {
      toast.error('Authentication failed', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'signup': return 'Create Your Account';
      case 'forgot': return 'Reset Password';
      case 'reset': return 'Set New Password';
      default: return 'Welcome Back';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'signup': return 'Create a free account to save your selections and continue anytime';
      case 'forgot': return 'Enter your email to receive a password reset link';
      case 'reset': return 'Enter your new password below';
      default: return 'Sign in to continue with your saved selections';
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo />
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-2">
              {getTitle()}
            </h1>
            <p className="text-muted-foreground">
              {getDescription()}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="space-y-4">
                {mode !== 'reset' && (
                  <div>
                    <Label htmlFor="email" className="text-foreground">Email Address</Label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                )}

                {(mode === 'signin' || mode === 'signup') && (
                  <div>
                    <Label htmlFor="password" className="text-foreground">
                      {mode === 'signup' ? 'Create Password' : 'Password'}
                    </Label>
                    <div className="relative mt-1.5">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                        minLength={6}
                      />
                    </div>
                    {mode === 'signup' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Must be at least 6 characters
                      </p>
                    )}
                  </div>
                )}

                {mode === 'signup' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                  >
                    <Label htmlFor="confirmPassword" className="text-foreground">
                      Confirm Password
                    </Label>
                    <div className="relative mt-1.5">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        required
                        minLength={6}
                      />
                    </div>
                  </motion.div>
                )}

                {mode === 'reset' && (
                  <>
                    <div>
                      <Label htmlFor="new-password" className="text-foreground">New Password</Label>
                      <div className="relative mt-1.5">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="new-password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10"
                          required
                          minLength={6}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Must be at least 6 characters
                      </p>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                    >
                      <Label htmlFor="confirm-password" className="text-foreground">
                        Confirm New Password
                      </Label>
                      <div className="relative mt-1.5">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="confirm-password"
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pl-10"
                          required
                          minLength={6}
                        />
                      </div>
                    </motion.div>
                  </>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full mt-6 gap-2" 
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : mode === 'signup' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Create Account & Continue
                  </>
                ) : mode === 'forgot' ? (
                  <>
                    <Mail className="w-4 h-4" />
                    Send Reset Link
                  </>
                ) : mode === 'reset' ? (
                  <>
                    <KeyRound className="w-4 h-4" />
                    Update Password
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Sign In & Continue
                  </>
                )}
              </Button>

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot your password?
                </button>
              )}
            </div>
          </form>

          <div className="mt-6 text-center space-y-2">
            {(mode === 'forgot' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  window.history.replaceState(null, '', window.location.pathname);
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to sign in
              </button>
            )}
            {(mode === 'signin' || mode === 'signup') && (
              <button
                type="button"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-sm text-primary hover:text-primary/80 transition-colors font-medium"
              >
                {mode === 'signup' 
                  ? 'Already have an account? Sign in' 
                  : "Don't have an account? Create one"}
              </button>
            )}
          </div>

          {(mode === 'signin' || mode === 'signup') && (
            <div className="mt-8 p-4 rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                Your selections are automatically saved as you go. 
                You can return anytime to complete or modify your choices.
              </p>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
