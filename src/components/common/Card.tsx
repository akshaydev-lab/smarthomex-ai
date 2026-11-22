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
        glowBorder && 'border-cyan-500/30 shadow-glow-cyan',
        interactive && 'cursor-pointer hover:border-cyan-400/40 hover:-translate-y-1',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
