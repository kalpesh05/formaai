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
      container: 'bg-blue-50 border-l-4 border-blue-500 text-blue-800',
      icon: <Info className="text-blue-600 flex-shrink-0" size={16} />,
    },
  };

  const style = styles[type];

  return (
    <div className={`p-3 rounded-md flex items-start justify-between gap-3 text-sm ${style.container} ${className}`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">{style.icon}</div>
        <div className="leading-snug">{children}</div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
