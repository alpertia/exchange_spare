import { supabase } from "@/lib/supabase"

export async function getOrCreateConversationForListing(
  listingId: string,
  sellerCompanyId: string,
  buyerCompanyId: string
) {
  // existing?
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("listing_id", listingId)
    .maybeSingle()

  if (existing) return existing

  const { data: created } = await supabase
    .from("conversations")
    .insert({
      listing_id: listingId,
      seller_company_id: sellerCompanyId,
      buyer_company_id: buyerCompanyId,
      status: "active"
    })
    .select()
    .single()

  return created
}