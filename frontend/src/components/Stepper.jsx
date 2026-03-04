import { Check } from 'lucide-react';

const STEPS = [
  { label: 'Essentials', short: '1' },
  { label: 'Customize', short: '2' },
  { label: 'Review & Run', short: '3' },
];

export default function Stepper({ currentStep }) {
  return (
    <nav className="flex items-center justify-center gap-1 sm:gap-2 mb-8 mt-6">
      {STEPS.map((step, i) => {
        const isDone = i < currentStep;
        const isCurrent = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <div key={i} className="flex items-center">
            {/* Step circle + label */}
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isDone
                    ? 'bg-db-teal text-white'
                    : isCurrent
                    ? 'bg-db-red text-white shadow-lg shadow-db-red/30'
                    : 'bg-white/5 text-slate-500 border border-white/10'
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : step.short}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline transition-colors duration-300 ${
                  isDone
                    ? 'text-db-teal'
                    : isCurrent
                    ? 'text-white'
                    : 'text-slate-500'
                }`}
              >
                {step.label}
              </span>
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div className={`w-8 sm:w-14 h-[2px] mx-2 sm:mx-3 rounded-full transition-colors duration-300 ${
                isDone ? 'bg-db-teal/40' : 'bg-white/10'
              }`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
