'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface AdminUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  confirmed_at: string | null
  role: string
  company_name: string | null
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if ((profile as any)?.role !== 'admin') {
        router.push('/dashboard')
        return
      }

      const res = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })
      const json = await res.json()

      if (json.error) {
        setError(json.error)
      } else {
        setUsers(json.users)
      }
      setLoading(false)
    }

    load()
  }, [router])

  if (loading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">Hata: {error}</div>

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Kayitli Kullanicilar ({users.length})</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Email</th>
            <th className="p-2">Sirket</th>
            <th className="p-2">Rol</th>
            <th className="p-2">Kayit Tarihi</th>
            <th className="p-2">Son Giris</th>
            <th className="p-2">Onayli mi</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-b hover:bg-gray-50">
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.company_name ?? '-'}</td>
              <td className="p-2">{u.role}</td>
              <td className="p-2">{new Date(u.created_at).toLocaleDateString('tr-TR')}</td>
              <td className="p-2">
                {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('tr-TR') : '-'}
              </td>
              <td className="p-2">{u.confirmed_at ? 'Evet' : 'Hayir'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
