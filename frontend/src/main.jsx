import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { removeInjectedDisclaimerBanner } from './lib/stripAiDisclaimer.js'

removeInjectedDisclaimerBanner()
let _discClaimerTimer
const _discClaimerObs = new MutationObserver(() => {
  clearTimeout(_discClaimerTimer)
  _discClaimerTimer = setTimeout(removeInjectedDisclaimerBanner, 100)
})
_discClaimerObs.observe(document.body, { childList: true, subtree: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
