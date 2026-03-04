import { Rocket } from 'lucide-react';
import ConfigForm from '../components/ConfigForm';

export default function LaunchPage({ onSubmit, isSubmitting, submitError, apiFetch }) {
  return (
    <div>
      {/* Page header */}
      <div className="text-center pt-2 pb-4">
        <div className="w-14 h-14 rounded-2xl bg-db-navy/60 border border-white/10 flex items-center justify-center mx-auto mb-4">
          <Rocket className="w-7 h-7 text-db-orange" />
        </div>
        <h1 className="text-xl font-bold text-white">Launch an Inspire Job</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
          Configure the parameters and start your AI analysis.
        </p>
      </div>

      <ConfigForm
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        submitError={submitError}
        disabled={false}
        apiFetch={apiFetch}
      />
    </div>
  );
}
