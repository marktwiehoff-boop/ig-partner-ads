import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/Auth.jsx'

const PUNKTE = [
  { zu: '/', text: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { zu: '/regionen', text: 'Regionen', icon: 'M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z' },
  { zu: '/studio', text: 'Studio', icon: 'M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' },
  { zu: '/freigaben', text: 'Freigaben', icon: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' },
]

export default function Layout() {
  const { profil, istAdmin, abmelden } = useAuth()
  const punkte = istAdmin ? [...PUNKTE, { zu: '/nutzer', text: 'Nutzer', icon: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05A4.2 4.2 0 0 1 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' }] : PUNKTE

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-forest text-cream shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="font-display text-xl">immergrün <span className="text-fresh">Partner-Ads</span></span>
          </div>
          <nav className="hidden gap-1 md:flex" aria-label="Hauptmenü">
            {punkte.map((p) => (
              <NavLink key={p.zu} to={p.zu} end className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-fresh text-forest' : 'hover:bg-dunkel'}`}>
                {p.text}
              </NavLink>
            ))}
          </nav>
          <button onClick={abmelden} className="rounded-lg px-2 py-2 text-xs text-cream/80 hover:bg-dunkel" title={profil?.email}>
            Abmelden
          </button>
        </div>
      </header>

      <main><Outlet /></main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-forest/10 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Hauptmenü">
        <div className="flex">
          {punkte.map((p) => (
            <NavLink key={p.zu} to={p.zu} end className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-forest' : 'text-forest/50'}`}>
              {({ isActive }) => (
                <>
                  <svg viewBox="0 0 24 24" className={`h-6 w-6 ${isActive ? 'fill-forest' : 'fill-forest/40'}`} aria-hidden="true"><path d={p.icon} /></svg>
                  {p.text}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
