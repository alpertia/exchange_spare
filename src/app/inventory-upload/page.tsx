"use client"

import { useState } from "react"
import Papa from "papaparse"
import { supabase } from "@/lib/supabase"
console.log("UPLOAD PAGE LOADED")

function normalizePN(pn: string) {
  return pn?.toUpperCase().replace(/[\s-]/g, "")
}

function normalizeHeader(h: string) {
  return h?.trim().toUpperCase()
}

export default function InventoryUpload() {
  const [loading, setLoading] = useState(false)

 const handleFile = async (file: File) => {
  console.log("HANDLE FILE TRIGGERED")
  setLoading(true)

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        alert("User not authenticated")
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single()

      if (profileError || !profile?.company_id) {
        console.error("Profile load error:", profileError)
        alert("Company not found")
        setLoading(false)
        return
      }

      const companyId = profile.company_id
      console.log("UPLOAD COMPANY:", companyId)

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => normalizeHeader(header),
        complete: async (results) => {

          const rows = results.data as any[]

          const cleanRows = rows
            .map((r) => {
              const vendor = r["VENDOR"]
              const partNumber = r["PART NUMBER"]
              const quantity = r["QUANTITY"]
              const location = r["LOCATION"]
              const condition = r["CONDITION"]

              return {
                company_id: companyId,
                brand: vendor?.trim(),
                part_number: partNumber?.trim(),
                normalized_pn: normalizePN(partNumber),
                quantity: parseInt(quantity) || 0,
                price: null,
                condition: condition || null,
                country: location || null,
              }
            })
            .filter(r => r.normalized_pn && r.quantity > 0)

          if (cleanRows.length === 0) {
            alert("No valid rows found. Check column names.")
            setLoading(false)
            return
          }

          console.log("CLEAN ROWS:", cleanRows.length)

          // 1️⃣ Insert staging
          const { error: insertError } = await supabase
            .from("inventory_import_staging")
            .insert(cleanRows)

          if (insertError) {
            console.error("Staging insert error:", insertError)
            alert("Upload error (staging)")
            setLoading(false)
            return
          }

          // 2️⃣ Call processing RPC
          const { error: rpcError } = await supabase.rpc(
            "process_monthly_inventory",
            { p_company: companyId }
          )

          if (rpcError) {
            console.error("RPC error:", rpcError)
            alert("Processing error")
            setLoading(false)
            return
          }

          alert("Inventory uploaded successfully")
          setLoading(false)
        },
      })

    } catch (err) {
      console.error("Unexpected error:", err)
      alert("Unexpected error")
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">

      <h1 className="text-xl font-semibold mb-4">
        Upload Monthly Inventory (CSV)
      </h1>

      <p className="text-sm text-gray-500 mb-6">
        Accepted headers (case-insensitive):
        VENDOR | PART NUMBER | LOCATION | QUANTITY | CONDITION
      </p>

      <input
        type="file"
        accept=".csv"
        onChange={(e) => {
          if (e.target.files) {
            handleFile(e.target.files[0])
          }
        }}
        className="border p-3 rounded"
      />

      {loading && <p className="mt-4">Processing...</p>}
    </div>
  )
}