import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import HarnessApp from './HarnessApp.jsx';

const params = new URLSearchParams(window.location.search);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HarnessApp
      open={params.get('open')}
      nest={params.get('nest') === '1'}
      discoveryType={params.get('discovery') || 'Standard'}
    />
  </StrictMode>,
);
