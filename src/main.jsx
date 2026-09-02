import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ScheduleProvider } from './state/ScheduleContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ScheduleProvider>
      <App />
    </ScheduleProvider>
  </StrictMode>,
)
