'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo from '@/components/Logo'
import { supabase } from '@/lib/supabase'

const NAV = [
  { label: 'Marketplace',     href: '/marketplace' },
  { label: 'Trade Assurance', href: '/trade-assurance' },
  { label: 'Knowledge Base',  href: '/knowledge-base' },
  { label: 'Consultants',     href: '/consultants' },
]

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [checked, setChecked]   = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session)
      setChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F7F6F2', minHeight: '100vh', color: '#0A0A0A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F7F6F2; }
        .btn-main { display: inline-flex; align-items: center; gap: 8px; background: #0A0A0A; color: #F7F6F2; border: none; padding: 13px 26px; border-radius: 100px; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; transition: background 0.2s; }
        .btn-main:hover { background: #222; }
        .btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #0A0A0A; border: 1.5px solid rgba(10,10,10,0.2); padding: 13px 26px; border-radius: 100px; font-family: inherit; font-size: 14px; cursor: pointer; text-decoration: none; }
        .tag { display: inline-block; background: #E8E4D9; color: #5A5545; font-size: 11px; font-weight: 500; padding: 4px 12px; border-radius: 100px; letter-spacing: 0.04em; text-transform: uppercase; }
        .card { background: white; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 28px; }
        .hover-lift { transition: transform 0.2s; }
        .hover-lift:hover { transform: translateY(-2px); }
        .pn { font-family: 'DM Mono', monospace; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .a1{animation:fadeUp 0.7s ease 0.1s both} .a2{animation:fadeUp 0.7s ease 0.2s both} .a3{animation:fadeUp 0.7s ease 0.3s both}
      `}</style>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 48px', height: 64, background: scrolled ? 'rgba(247,246,242,0.92)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : 'none', transition: 'all 0.3s ease' }}>
        <Logo size={30} linkTo="/" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {NAV.map(item => (
            <Link key={item.label} href={item.href} style={{ fontSize: 13, color: pathname === item.href ? '#0A0A0A' : '#5A5545', textDecoration: 'none', fontWeight: pathname === item.href ? 600 : 400 }}>
              {item.label}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, minWidth: 180, justifyContent: 'flex-end' }}>
          {!checked ? (
            <div style={{ width: 120, height: 36 }} />
          ) : loggedIn ? (
            <Link href="/dashboard/marketplace" className="btn-main" style={{ padding: '9px 20px', fontSize: 13 }}>My SpareShare →</Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost" style={{ padding: '9px 20px', fontSize: 13 }}>Log in</Link>
              <Link href="/register" className="btn-main" style={{ padding: '9px 20px', fontSize: 13 }}>Get started</Link>
            </>
          )}
        </div>
      </nav>

      {children}

      <footer style={{ padding: '32px 48px', background: '#0A0A0A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo size={16} linkTo="/" dark={true} />
          <span style={{ fontSize: 11, color: '#3A3A3A' }}>· B2B Exchange with Trade Assurance</span>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 12, color: '#6A6A6A' }}>
          {['Trade Assurance', 'Privacy', 'Terms', 'Contact'].map(l => <span key={l} style={{ cursor: 'pointer' }}>{l}</span>)}
        </div>
        <div style={{ fontSize: 12, color: '#6A6A6A' }}>© 2026 SpareShare</div>
      </footer>
    </div>
  )
}
