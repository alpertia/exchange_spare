"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Wanted() {
  const [intents, setIntents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadIntents = async () => {
      const { data, error } = await supabase
        .from("trade_intent")
        .select(`
          id,
          quantity,
          status,
          created_at,
          products:product_id (
            brand,
            normalized_pn
          ),
          companies:company_id (
            public_name,
            is_masked,
            name
          )
        `)
        .eq("status", "active")
        .order("created_at", { ascending: false })

      if (error) {
        console.log("WANTED LOAD ERROR:", error)
      } else {
        console.log("WANTED DATA:", data)
        setIntents(data || [])
      }

      setLoading(false)
    }

    loadIntents()
  }, [])

  if (loading) {
    return <div style={{ padding: 40 }}>Loading...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Wanted Items</h2>

      {intents.length === 0 && (
        <p>No active requests.</p>
      )}

      {intents.map((intent) => (
        <div
          key={intent.id}
          style={{
            border: "1px solid #ccc",
            padding: 15,
            marginTop: 15,
          }}
        >
          <h3>
            {intent.products?.brand}{" "}
            {intent.products?.normalized_pn}
          </h3>

          <div>
            Qty Needed: {intent.quantity}
          </div>

          <div style={{ marginTop: 5, fontSize: 14, color: "#555" }}>
            Requested by:{" "}
            {intent.companies?.is_masked
              ? intent.companies.public_name
              : intent.companies.name}
          </div>
        </div>
      ))}
    </div>
  )
}