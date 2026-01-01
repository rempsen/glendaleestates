interface LogoProps {
  variant?: 'full' | 'icon';
  className?: string;
}

export function Logo({ variant = 'full', className = '' }: LogoProps) {
  if (variant === 'icon') {
    return (
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg overflow-hidden bg-background ${className}`}>
        <img 
          src="/images/bmd-logo.png" 
          alt="BMD Materials" 
          className="w-8 h-8 object-contain"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex items-center justify-center w-12 h-12 rounded-lg overflow-hidden bg-background shadow-md">
        <img 
          src="/images/bmd-logo.png" 
          alt="BMD Materials" 
          className="w-10 h-10 object-contain"
        />
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
