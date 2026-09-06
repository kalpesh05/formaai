import React from 'react';
import { CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react';

export type BadgeStatus = 
  | 'live' 
  | 'draft' 
  | 'open' 
  | 'pending' 
  | 'closed' 
  | 'success' 
  | 'failed' 
  | 'processed';

interface BadgeProps {
  status: BadgeStatus;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export default function Badge({ status, label, size = 'md', className = '' }: BadgeProps) {
  const displayLabel = label || status;

  const styles: Record<BadgeStatus, { badge: string; icon: React.ReactNode }> = {
    live: {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
    },
    draft: {
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: null
    },
    open: {
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <AlertCircle size={10} />
    },
    pending: {
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: <Clock size={10} />
    },
    closed: {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <CheckCircle2 size={10} />
    },
    success: {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      icon: <CheckCircle2 size={10} />
    },
    failed: {
      badge: 'bg-red-50 text-red-700 border-red-100',
      icon: <XCircle size={10} />
    },
    processed: {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <CheckCircle2 size={11} />
    }
  };

  const { badge, icon } = styles[status] || styles.draft;
  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-[10px]' 
    : 'px-2.5 py-0.5 text-xs';

  return (
    <span 
      className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wider border ${badge} ${sizeClasses} ${className}`}
    >
      {icon}
      <span className="capitalize">{displayLabel}</span>
    </span>
  );
}
