import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { Mail, Lock, ArrowRight, UserPlus, LogIn, KeyRound } from 'lucide-react';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

export default function Auth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [isReady, setIsReady] = useState(false);
  const hasSignedOut = useRef(false);

  useEffect(() => {
    // Check if this is a password reset callback
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    
    if (type === 'recovery') {
      setMode('reset');
      setIsReady(true);
      return;
    }

    // Sign out any existing session when accessing admin login
    // This ensures a fresh login without cached credentials
    const initAuth = async () => {
      if (!hasSignedOut.current) {
        hasSignedOut.current = true;
        await supabase.auth.signOut();
        setIsReady(true);
      }
    };
    
    initAuth();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    // Only set up auth listener after we've cleared any existing session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && mode !== 'reset') {
        navigate('/admin/submissions');
      }
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, isReady, mode]);

  const validateForm = () => {
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return false;
    }
    if (mode !== 'forgot' && (!password || password.length < 6)) {
      toast.error('Password must be at least 6 characters');
      return false;
    }
    if (mode === 'reset' && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      
      if (error) throw error;
      
      toast.success('Password reset email sent!', {
        description: 'Check your inbox for the reset link.',
      });
      setMode('signin');
    } catch (error: any) {
      toast.error('Failed to send reset email', {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
    } catch (error: any) {
      toast.error('Failed to reset password', {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'forgot') {
      return handleForgotPassword(e);
    }
    
    if (mode === 'reset') {
      return handleResetPassword(e);
    }
    
    if (!validateForm()) return;
    
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin/submissions`,
          },
        });
        
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('This email is already registered. Please sign in instead.');
          } else {
            throw error;
          }
        } else {
          toast.success('Account created successfully!', {
            description: 'You can now access the admin area.',
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) {
          if (error.message.includes('Invalid login')) {
            toast.error('Invalid email or password');
          } else {
            throw error;
          }
        } else {
          toast.success('Welcome back!');
        }
      }
    } catch (error: any) {
      toast.error('Authentication failed', {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'signup': return 'Create Admin Account';
      case 'forgot': return 'Reset Password';
      case 'reset': return 'Set New Password';
      default: return 'Admin Login';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'signup': return 'Sign up to access the admin dashboard';
      case 'forgot': return 'Enter your email to receive a reset link';
      case 'reset': return 'Enter your new password below';
      default: return 'Sign in to manage buyer submissions';
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo />
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
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
                    <Label htmlFor="email" className="text-foreground">Email</Label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        name="admin-email-new"
                        placeholder="admin@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                        autoComplete="off"
                        data-lpignore="true"
                        data-form-type="other"
                      />
                    </div>
                  </div>
                )}

                {(mode === 'signin' || mode === 'signup') && (
                  <div>
                    <Label htmlFor="password" className="text-foreground">Password</Label>
                    <div className="relative mt-1.5">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        name="admin-password-new"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-form-type="other"
                      />
                    </div>
                  </div>
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
                          name="new-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10"
                          required
                          minLength={6}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="confirm-password" className="text-foreground">Confirm Password</Label>
                      <div className="relative mt-1.5">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="confirm-password"
                          type="password"
                          name="confirm-password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pl-10"
                          required
                          minLength={6}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full mt-6 gap-2" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : mode === 'signup' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Create Account
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
                    Sign In
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
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to sign in
              </button>
            )}
            {mode === 'reset' && (
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
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === 'signup' 
                  ? 'Already have an account? Sign in' 
                  : "Don't have an account? Sign up"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
