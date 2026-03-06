'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Conv = {
  id: string; company_a: string; company_b: string; created_at: string
  other_id: string; display_name: string
  unread: number; last_msg: string; last_time: string
}
type Msg = {
  id: string; conversation_id: string; sender_company_id: string
  receiver_company_id: string; content: string; created_at: string; read_at: string | null
}

// Daily anonymous 4-digit code — same company gets same code all day
function dailyCode(id: string) {
  const day = new Date().toISOString().slice(0, 10)
  let h = 2166136261
  for (const c of id + day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); h >>>= 0 }
  return String((h % 9000) + 1000)
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return new Date(d).toLocaleDateString()
}

function hasContact(t: string) {
  return /(\+?\d[\d\s\-(.)]{6,}\d)|([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/.test(t)
}

export default function MessagesPage() {
  const [myId, setMyId] = useState<string | null>(null)
  const [myCode, setMyCode] = useState('')
  const [convs, setConvs] = useState<Conv[]>([])
  const [active, setActive] = useState<Conv | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const myRef = useRef<string | null>(null)

  useEffect(() => {
    init()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
    if (!p?.company_id) return
    myRef.current = p.company_id
    setMyId(p.company_id)
    setMyCode(dailyCode(p.company_id))
    await loadConvs(p.company_id)
    setLoading(false)
  }

  async function loadConvs(cid: string) {
    const { data } = await supabase.from('conversations').select('*')
      .or(`company_a.eq.${cid},company_b.eq.${cid}`).order('created_at', { ascending: false })
    if (!data) return

    const enriched = await Promise.all(data.map(async (c: any) => {
      const otherId = c.company_a === cid ? c.company_b : c.company_a
      // Count only messages RECEIVED by me that are unread
      const [{ count }, { data: last }] = await Promise.all([
        supabase.from('messages').select('*', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .eq('receiver_company_id', cid)
          .is('read_at', null),
        supabase.from('messages').select('content, created_at, sender_company_id')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      return {
        ...c, other_id: otherId,
        display_name: `Company ${dailyCode(otherId)}`,
        unread: count || 0,
        last_msg: (last as any)?.content || '',
        last_time: (last as any)?.created_at || c.created_at,
      }
    }))
    enriched.sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime())
    setConvs(enriched)
  }

  async function openConv(conv: Conv) {
    const cid = myRef.current
    if (!cid) return
    setActive(conv)

    // Mark all received unread messages as read
    await supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conv.id)
      .eq('receiver_company_id', cid)
      .is('read_at', null)

    // Refresh conversation list (clears the unread badge)
    await loadConvs(cid)

    const { data } = await supabase.from('messages').select('*')
      .eq('conversation_id', conv.id).order('created_at', { ascending: true })
    setMsgs(data || [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)

    // Realtime subscription
    if (channelRef.current) await supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel(`conv_${conv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv.id}` },
        async (p) => {
          const newMsg = p.new as Msg
          setMsgs(prev => [...prev, newMsg])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
          // Auto-mark as read if I'm the receiver and the conversation is open
          if (newMsg.receiver_company_id === myRef.current) {
            await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', newMsg.id)
          }
          const id = myRef.current
          if (id) loadConvs(id)
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv.id}` },
        (p) => {
          // Update read_at in local state (for double tick)
          setMsgs(prev => prev.map(m => m.id === p.new.id ? { ...m, read_at: p.new.read_at } : m))
        })
      .subscribe()
  }

  async function send() {
    const cid = myRef.current
    if (!active || !cid || !text.trim()) return
    if (hasContact(text)) { setBlocked(true); setTimeout(() => setBlocked(false), 3000); return }
    setSending(true)
    await supabase.from('messages').insert({
      conversation_id: active.id,
      sender_company_id: cid,
      receiver_company_id: active.other_id,
      content: text.trim(),
    })
    setText('')
    setSending(false)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 96px)', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>

      {/* SIDEBAR */}
      <div style={{ width: 290, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Messages</div>
          {myCode && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
              You: <strong style={{ color: '#64748b' }}>Dealer {myCode}</strong>
              <span style={{ marginLeft: 6, opacity: 0.7 }}>(changes daily)</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convs.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No conversations yet.<br />Use Contact on Marketplace.
            </div>
          ) : convs.map(c => (
            <div key={c.id} onClick={() => openConv(c)}
              style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', borderLeft: `3px solid ${active?.id === c.id ? '#1e40af' : 'transparent'}`, background: active?.id === c.id ? '#eff6ff' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: c.unread > 0 ? 700 : 500, fontSize: 13, color: '#0f172a' }}>{c.display_name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(c.last_time)}</span>
                  {c.unread > 0 && (
                    <span style={{ background: '#ef4444', color: 'white', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{c.unread}</span>
                  )}
                </div>
              </div>
              {c.last_msg && (
                <div style={{ fontSize: 12, color: c.unread > 0 ? '#374151' : '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: c.unread > 0 ? 500 : 400 }}>
                  {c.last_msg}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CHAT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!active ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 8, padding: 40 }}>
            <div style={{ fontSize: 14 }}>Select a conversation</div>
            <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
              Identities are anonymous.<br />IDs refresh daily. Phone and email blocked.
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '13px 20px', borderBottom: '1px solid #e2e8f0', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{active.display_name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Anonymous · IDs change daily</div>
            </div>

            <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {msgs.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>
                  Start the conversation — ask about product, price, or quantity.
                </div>
              )}
              {msgs.map(m => {
                const isMe = m.sender_company_id === myId
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '68%', padding: '9px 13px', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: isMe ? '#1e40af' : '#f1f5f9', color: isMe ? 'white' : '#0f172a', fontSize: 14, lineHeight: 1.5 }}>
                      {m.content}
                      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: isMe ? 'right' : 'left', display: 'flex', alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 3 }}>
                        <span>{timeAgo(m.created_at)}</span>
                        {/* Read receipt: double tick if read_at set */}
                        {isMe && (
                          <span style={{ fontSize: 11 }} title={m.read_at ? `Read ${timeAgo(m.read_at)}` : 'Sent'}>
                            {m.read_at ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 16px', background: 'white' }}>
              {blocked && (
                <div style={{ padding: '6px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12, marginBottom: 8 }}>
                  ⛔ Phone numbers and emails cannot be shared at this stage.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: '9px 13px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} />
                <button onClick={send} disabled={sending || !text.trim()}
                  style={{ padding: '9px 18px', background: sending || !text.trim() ? '#94a3b8' : '#1e40af', color: 'white', border: 'none', borderRadius: 8, cursor: sending || !text.trim() ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 500 }}>
                  {sending ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
