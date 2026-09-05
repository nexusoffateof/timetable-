import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ScheduleProvider } from './state/ScheduleContext.jsx'
import { AuthProvider } from './state/AuthContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <ScheduleProvider>
        <App />
      </ScheduleProvider>
    </AuthProvider>
  </StrictMode>,
)
