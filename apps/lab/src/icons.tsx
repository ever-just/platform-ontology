import { Circle } from 'lucide-react';
import { iconMap } from './generated/iconMap';

export function Icon({ name, size = 16, className, strokeWidth = 1.75 }: { name?: string; size?: number; className?: string; strokeWidth?: number }) {
  const C = (name && iconMap[name]) || Circle;
  return <C size={size} className={className} strokeWidth={strokeWidth} aria-hidden />;
}
