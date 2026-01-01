import { Home } from 'lucide-react';

interface LogoProps {
  variant?: 'full' | 'icon';
  className?: string;
}

export function Logo({ variant = 'full', className = '' }: LogoProps) {
  if (variant === 'icon') {
    return (
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg gradient-hero ${className}`}>
        <Home className="w-5 h-5 text-primary-foreground" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex items-center justify-center w-10 h-10 rounded-lg gradient-hero shadow-md">
        <Home className="w-5 h-5 text-primary-foreground" />
      </div>
      <div className="flex flex-col">
        <span className="font-serif text-xl font-semibold text-foreground tracking-tight">
          Glendale Estates
        </span>
        <span className="text-xs text-muted-foreground tracking-wide uppercase">
          by BMD Materials
        </span>
      </div>
    </div>
  );
}
