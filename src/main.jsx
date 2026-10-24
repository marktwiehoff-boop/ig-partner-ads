import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { konfiguriert } from './lib/supabase.js'
import { AuthProvider } from './context/Auth.jsx'
import { NichtKonfiguriert } from './pages/Gesperrt.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {konfiguriert ? (
      <BrowserRouter>
        <AuthProvider><App /></AuthProvider>
      </BrowserRouter>
    ) : <NichtKonfiguriert />}
  </StrictMode>,
)
