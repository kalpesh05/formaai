import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  dashedBorder?: boolean;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  dashedBorder = true,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`bg-white rounded-xl py-12 px-6 text-center text-slate-500 max-w-lg mx-auto ${
        dashedBorder ? 'border border-dashed border-slate-300' : 'border border-slate-200 shadow-sm'
      } ${className}`}
    >
      <div className="flex justify-center text-slate-400 mb-3.5">
        {icon}
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5 leading-relaxed">
        {description}
      </p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
