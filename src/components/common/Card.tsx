import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glowBorder?: boolean;
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  glowBorder = false,
  interactive = false,
  ...props
}) => {
  return (
    <div
      className={cn(
        'glass-card rounded-2xl p-5 relative overflow-hidden',
        glowBorder && 'border-emerald-500/35 shadow-glow-emerald',
        interactive && 'cursor-pointer hover:border-emerald-500/40 hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
