import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

interface AlertProps {
  type?: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export default function Alert({
  type = 'info',
  children,
  action,
  className = '',
}: AlertProps) {
  const styles = {
    success: {
      container: 'bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800',
      icon: <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={16} />,
    },
    error: {
      container: 'bg-red-50 border-l-4 border-red-500 text-red-800',
      icon: <XCircle className="text-red-600 flex-shrink-0" size={16} />,
    },
    warning: {
      container: 'bg-amber-50 border-l-4 border-amber-500 text-amber-800',
      icon: <AlertTriangle className="text-amber-600 flex-shrink-0" size={16} />,
    },
    info: {
      container: 'bg-blue-50 border-l-4 border-brand-500 text-brand-900',
      icon: <Info className="text-brand-600 flex-shrink-0" size={16} />,
    },
  };

  const { container, icon } = styles[type];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`p-3.5 rounded-lg text-xs flex items-center justify-between shadow-xs ${container} ${className}`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <div className="leading-relaxed">{children}</div>
      </div>
      {action && <div className="ml-3 flex-shrink-0">{action}</div>}
    </div>
  );
}
