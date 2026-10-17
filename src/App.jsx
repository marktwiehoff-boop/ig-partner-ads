import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/Auth.jsx'
import Layout from './components/Layout.jsx'
import { Laden } from './components/Teile.jsx'
import Login from './pages/Login.jsx'
import { NichtFreigeschaltet } from './pages/Gesperrt.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Regionen from './pages/Regionen.jsx'
import ContentStudio from './pages/ContentStudio.jsx'
import Freigaben from './pages/Freigaben.jsx'
import Nutzer from './pages/Nutzer.jsx'

export default function App() {
  const { session, profil, istAdmin } = useAuth()
  if (session === undefined || (session && profil === undefined)) return <div className="p-6"><Laden /></div>
  if (!session) return <Login />
  if (!profil) return <NichtFreigeschaltet />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="regionen" element={<Regionen />} />
        <Route path="studio" element={<ContentStudio />} />
        <Route path="freigaben" element={<Freigaben />} />
        {istAdmin && <Route path="nutzer" element={<Nutzer />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
