'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Msg = { id: string; role: 'user' | 'assistant'; content: string }

export default function AssistantPanel({
  open, onClose, companyId,
}: { open: boolean; onClose: () => void; companyId: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && companyId && !loaded) loadHistory()
  }, [open, companyId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function loadHistory() {
    if (!companyId) return
    const { data } = await supabase
      .from('ai_chat_messages')
      .select('id, role, content')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .limit(50)
    setMessages((data || []) as Msg[])
    setLoaded(true)
  }

  async function send() {
    const text = input.trim()
    if (!text || !companyId || sending) return
    setErrorMsg('')
    setInput('')
    setSending(true)

    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)

    await supabase.from('ai_chat_messages').insert({ company_id: companyId, role: 'user', content: text })

    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (res.status === 402) {
        setErrorMsg('No AI credits left. Please top up in Settings.')
        setSending(false)
        return
      }
      if (!res.ok) {
        setErrorMsg('Something went wrong. Please try again.')
        setSending(false)
        return
      }

      const data = await res.json()
      const textBlocks = (data.content || []).filter((b: any) => b.type === 'text')
      const replyText = textBlocks.map((b: any) => b.text).join('\n').trim() || 'No response.'

      const assistantMsg: Msg = { id: crypto.randomUUID(), role: 'assistant', content: replyText }
      setMessages(prev => [...prev, assistantMsg])
      await supabase.from('ai_chat_messages').insert({ company_id: companyId, role: 'assistant', content: replyText })
    } catch (err) {
      setErrorMsg('Network error. Please try again.')
    }
    setSending(false)
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ position: 'relative', width: 400, maxWidth: '100%', height: '100vh', background: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)' }}>

        <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>🤖 AI Assistant</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Ask about parts, listings, or the platform</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && loaded && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 40 }}>
              Ask me anything — part availability, pricing, or how to use ExchangeSpare.
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%', padding: '9px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
              background: m.role === 'user' ? '#0f172a' : '#f1f5f9',
              color: m.role === 'user' ? 'white' : '#0f172a',
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          ))}
          {sending && (
            <div style={{ alignSelf: 'flex-start', padding: '9px 12px', borderRadius: 10, background: '#f1f5f9', color: '#94a3b8', fontSize: 13 }}>
              Thinking...
            </div>
          )}
        </div>

        {errorMsg && (
          <div style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', fontSize: 12 }}>{errorMsg}</div>
        )}

        <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Type a message..."
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }}
          />
          <button onClick={send} disabled={sending || !input.trim()}
            style={{ padding: '9px 16px', background: sending || !input.trim() ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: 8, cursor: sending ? 'default' : 'pointer', fontSize: 13, fontWeight: 600 }}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
