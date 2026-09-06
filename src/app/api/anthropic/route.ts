import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function dealerCode(id: string): string {
  const day = new Date().toISOString().slice(0, 10)
  let h = 2166136261
  for (const c of id + day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); h >>>= 0 }
  return String((h % 9000) + 1000)
}

const TOOLS = [
  {
    name: 'search_products',
    description: 'Search the product knowledge base by part number (PN), brand, or description. Use this to check if a product exists in the catalogue.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part number, brand, or description keyword to search for' },
        limit: { type: 'number', description: 'Max results to return (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_listings',
    description: 'Search active sell listings. Use this to check if a specific product is currently available for sale, who is selling it, at what price, quantity, and location.',
    input_schema: {
      type: 'object',
      properties: {
        pn: { type: 'string', description: 'Part number to look up (exact or partial)' },
        brand: { type: 'string', description: 'Brand/manufacturer filter (optional)' },
        condition: { type: 'string', description: 'Condition filter: new, used, refurbished (optional)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_product_detail',
    description: 'Get full details of a specific product including description, lifecycle status, datasheet, compatibility, and all active listings for it.',
    input_schema: {
      type: 'object',
      properties: {
        normalized_pn: { type: 'string', description: 'The exact normalized part number' },
      },
      required: ['normalized_pn'],
    },
  },
  {
    name: 'search_buy_intents',
    description: 'Search active buy intents — companies looking to buy specific parts.',
    input_schema: {
      type: 'object',
      properties: {
        pn: { type: 'string', description: 'Part number to search in buy intents' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'start_conversation_with_seller',
    description: 'Start a direct anonymous conversation with a seller (or buyer) company about a specific listing or part. Use this when the user explicitly asks to contact, message, or reach out to a seller/buyer. Requires the company_id of the counterpart, which you get from search_listings or search_buy_intents results — but those results do not include company_id directly, so ask the user to confirm which specific listing they mean if there are multiple sellers, then use get_product_detail or search_listings again if needed to resolve it. If you cannot determine the counterpart company_id from available tools, tell the user you cannot start the conversation automatically and suggest they use the Ask button on the listing instead.',
    input_schema: {
      type: 'object',
      properties: {
        counterpart_company_id: { type: 'string', description: 'The company_id of the seller or buyer to start a conversation with' },
        product_id: { type: 'string', description: 'Optional product_id to attach to the conversation for context' },
        opening_message: { type: 'string', description: 'A short, polite opening message to send, mentioning the part number and what the user wants (e.g. availability, price). Write this in the same language the user is using.' },
      },
      required: ['counterpart_company_id'],
    },
  },
  {
    name: 'check_demand_signal',
    description: 'Check how much cross-platform interest a part number has received recently — how many distinct companies (anonymised, no identities revealed) searched for it in the last 7 and 30 days. Use this when the user asks things like "is anyone else looking for this", "is this popular", or "has this been searched before".',
    input_schema: {
      type: 'object',
      properties: {
        pn: { type: 'string', description: 'The part number to check demand for' },
      },
      required: ['pn'],
    },
  },
]

async function resolvePN(pn: string): Promise<string> {
  const normalized = pn.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const { data } = await supabaseAdmin
    .from('pn_aliases')
    .select('canonical_pn')
    .eq('alias_normalized', normalized)
    .not('canonical_pn', 'is', null)
    .single()
  return data?.canonical_pn || pn
}

async function logSearch(companyId: string | undefined, pn: string) {
  if (!pn) return
  try {
    await supabaseAdmin.from('ai_search_log').insert({
      company_id: companyId || null,
      pn: pn.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    })
  } catch (err: any) {
    console.error('ai_search_log insert failed:', err?.message || err)
  }
}

async function executeTool(name: string, input: any, companyId: string | undefined): Promise<string> {
  try {
    if (name === 'search_products') {
      const q = (input.query || '').trim()
      const limit = input.limit || 10
      if (q) await logSearch(companyId, q)
      const { data } = await supabaseAdmin
        .from('products')
        .select('normalized_pn, brand, description, lifecycle_status, category')
        .or(`normalized_pn.ilike.%${q}%,brand.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(limit)
      if (!data?.length) return `No products found matching "${q}"`
      return JSON.stringify(data, null, 2)
    }

    if (name === 'search_listings') {
      const limit = input.limit || 10
      let productIds: string[] = []

      if (input.pn) {
        await logSearch(companyId, input.pn)
        const resolvedPN = await resolvePN(input.pn)
        const searchPN = resolvedPN !== input.pn ? resolvedPN : input.pn
        const { data: prods } = await supabaseAdmin
          .from('products')
          .select('id')
          .ilike('normalized_pn', `%${searchPN}%`)
          .limit(50)
        productIds = (prods || []).map((p: any) => p.id)
        if (!productIds.length) return `No products found with PN matching "${input.pn}"`
      }

      let query = supabaseAdmin
        .from('listings')
        .select(`
          product_id, company_id, quantity, price, currency, condition, warehouse_location,
          manufacture_date, stock_entry_date, notes, created_at,
          product:product_id(normalized_pn, brand, description, lifecycle_status),
          company:company_id(name)
        `)
        .eq('status', 'active')
        .limit(limit)

      if (productIds.length) query = query.in('product_id', productIds)
      if (input.condition) query = query.eq('condition', input.condition)
      if (input.brand) {
        const { data: brandProds } = await supabaseAdmin
          .from('products').select('id').ilike('brand', `%${input.brand}%`).limit(100)
        const bIds = (brandProds || []).map((p: any) => p.id)
        if (bIds.length) query = query.in('product_id', bIds)
      }

      const { data } = await query
      if (!data?.length) return input.pn
        ? `No active listings found for PN "${input.pn}"`
        : 'No active listings found'

      return JSON.stringify((data as any[]).map(l => ({
        product_id: l.product_id,
        seller_company_id: l.company_id,
        pn: l.product?.normalized_pn,
        brand: l.product?.brand,
        description: l.product?.description,
        lifecycle: l.product?.lifecycle_status,
        seller: `Dealer ${dealerCode(l.company_id)}`,
        qty: l.quantity,
        price: l.price ? `${l.price} ${l.currency}` : 'price on request',
        condition: l.condition,
        location: l.warehouse_location,
        manufacture_date: l.manufacture_date,
        listed_on: l.created_at ? new Date(l.created_at).toLocaleDateString() : null,
        notes: l.notes,
      })), null, 2)
    }

    if (name === 'get_product_detail') {
      const pn = (input.normalized_pn || '').trim()
      if (pn) await logSearch(companyId, pn)
      const { data: prodData } = await supabaseAdmin
        .from('products').select('*').eq('normalized_pn', pn).single()
      if (!prodData) return `Product "${pn}" not found in catalogue`

      const { data: listingData } = await supabaseAdmin
        .from('listings')
        .select(`
          company_id, quantity, price, currency, condition, warehouse_location,
          manufacture_date, notes
        `)
        .eq('status', 'active')
        .eq('product_id', prodData.id)
        .limit(20)

      return JSON.stringify({
        product: prodData,
        active_listings: (listingData || []).map((l: any) => ({
          seller: `Dealer ${dealerCode(l.company_id)}`,
          qty: l.quantity,
          price: l.price ? `${l.price} ${l.currency}` : 'on request',
          condition: l.condition,
          location: l.warehouse_location,
          manufacture_date: l.manufacture_date,
          notes: l.notes,
        })),
        listing_count: listingData?.length || 0,
      }, null, 2)
    }

    if (name === 'search_buy_intents') {
      const limit = input.limit || 10
      let productIds: string[] = []

      if (input.pn) {
        const { data: prods } = await supabaseAdmin
          .from('products').select('id').ilike('normalized_pn', `%${input.pn}%`).limit(50)
        productIds = (prods || []).map((p: any) => p.id)
        if (!productIds.length) return `No buy intents found for PN "${input.pn}"`
      }

      let query = supabaseAdmin
        .from('listings')
        .select(`
          company_id, quantity, price, currency, notes, created_at,
          product:product_id(normalized_pn, brand, description)
        `)
        .eq('status', 'active')
        .eq('type', 'buy')
        .limit(limit)

      if (productIds.length) query = query.in('product_id', productIds)

      const { data } = await query
      if (!data?.length) return 'No active buy intents found'
      return JSON.stringify((data as any[]).map(l => ({
        pn: l.product?.normalized_pn,
        brand: l.product?.brand,
        buyer: `Dealer ${dealerCode(l.company_id)}`,
        qty_wanted: l.quantity,
        target_price: l.price ? `${l.price} ${l.currency}` : null,
        notes: l.notes,
      })), null, 2)
    }

    if (name === 'start_conversation_with_seller') {
      const counterpartId = (input.counterpart_company_id || '').trim()
      const myCompanyId = (input.__company_id || '').trim()
      console.error('DEBUG start_conversation_with_seller input:', JSON.stringify(input))
      if (!counterpartId) return 'No counterpart company_id provided'
      if (!myCompanyId) return 'Cannot start a conversation: missing requesting company_id'
      if (counterpartId === myCompanyId) return 'Cannot start a conversation with your own company'

      const { data: existing } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .or(`and(company_a.eq.${myCompanyId},company_b.eq.${counterpartId}),and(company_a.eq.${counterpartId},company_b.eq.${myCompanyId})`)
        .maybeSingle()

      let convId = existing?.id
      if (!convId) {
        const { data: created, error: createErr } = await supabaseAdmin
          .from('conversations')
          .insert({
            company_a: myCompanyId,
            company_b: counterpartId,
            product_id: input.product_id || null,
          })
          .select('id')
          .single()
        if (createErr) return `Failed to start conversation: ${createErr.message}`
        convId = created?.id
      }

      await supabaseAdmin.from('messages').insert({
        conversation_id: convId,
        sender_company_id: myCompanyId,
        receiver_company_id: counterpartId,
        content: input.opening_message || 'Hello, I would like to discuss this listing.',
      })

      return JSON.stringify({
        conversation_id: convId,
        status: existing ? 'existing_conversation_found' : 'new_conversation_created',
        note: 'An opening message was sent so this now appears at the top of My Messages for both companies. Tell the user the conversation has started.',
      }, null, 2)
    }

    if (name === 'check_demand_signal') {
      const pn = (input.pn || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (!pn) return 'No part number provided'

      const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const [{ data: last7 }, { data: last30 }] = await Promise.all([
        supabaseAdmin.from('ai_search_log').select('company_id').eq('pn', pn).gte('created_at', since7),
        supabaseAdmin.from('ai_search_log').select('company_id').eq('pn', pn).gte('created_at', since30),
      ])

      const distinctCompanies7 = new Set((last7 || []).map((r: any) => r.company_id).filter(Boolean)).size
      const distinctCompanies30 = new Set((last30 || []).map((r: any) => r.company_id).filter(Boolean)).size

      return JSON.stringify({
        pn,
        searches_last_7_days: last7?.length || 0,
        distinct_companies_last_7_days: distinctCompanies7,
        searches_last_30_days: last30?.length || 0,
        distinct_companies_last_30_days: distinctCompanies30,
        note: 'Company identities are never revealed — only aggregate anonymised counts.',
      }, null, 2)
    }

    return 'Unknown tool'
  } catch (err: any) {
    return `Tool error: ${err.message}`
  }
}

async function runWithTools(body: any): Promise<any> {
  const messages = [...(body.messages || [])]
  const companyLine = body.company_name
    ? `You are currently speaking with an employee of "${body.company_name}" — you know this company's name and may address them by it naturally (e.g. greet them, or say "as ${body.company_name}, you may already have..."). You do NOT know the individual employee's personal name.`
    : ''

  const system = body.system || `You are ExchangeSpare Assistant, an expert B2B electronics parts marketplace AI.
${companyLine}
You have live access to the ExchangeSpare platform database of 97,000+ products and active sell/buy listings.
You also receive the recent conversation history with this company on every request — this history is loaded from a persistent database and is NOT limited to the current browser session. This company's conversations with you are saved permanently and reloaded every time they reopen the assistant panel, even days later, even after closing the browser or restarting their computer. Treat this history as your own long-term memory of this company. Refer back to it naturally when relevant (e.g. "as I mentioned earlier", "you asked about this before"). NEVER claim you have no memory of past messages, NEVER claim conversations "reset" when the window closes, and NEVER claim you will not recognise this company next time — all of these claims are factually false in this system and must not be made.
When asked about product availability, ALWAYS search the database first using the provided tools.
When asked whether other companies have shown interest in a part, use check_demand_signal — never guess, and never reveal which specific company searched, only aggregate anonymised counts.
When the user asks to contact, message, or start a conversation with a seller or buyer, first use search_listings or search_buy_intents to find the seller_company_id (or buyer's company_id), confirm with the user which specific listing/company they mean if there is more than one match, then call start_conversation_with_seller. After it succeeds, tell the user the conversation has started and they can find it under "My Messages" — do not claim you sent an actual chat message, only that the conversation thread now exists.
Be concise and precise. Format prices and quantities clearly.
When listings are found, show: seller, quantity, price, condition, location, listing date.
When not found, say clearly and suggest searching by different PN variations.
Respond in the same language the user is writing in.`

  let response = await callClaude({ ...body, system, messages, tools: TOOLS })

  let iterations = 0
  while (response.stop_reason === 'tool_use' && iterations < 5) {
    iterations++
    const toolUseBlocks = (response.content || []).filter((b: any) => b.type === 'tool_use')

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block: any) => {
        const input = block.name === 'start_conversation_with_seller'
          ? { ...block.input, __company_id: body.company_id }
          : block.input
        const resultStr = await executeTool(block.name, input, body.company_id)
        if (block.name === 'start_conversation_with_seller') {
          try {
            const parsed = JSON.parse(resultStr)
            if (parsed.conversation_id) startedConversationId = parsed.conversation_id
          } catch {}
        }
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: resultStr,
        }
      })
    )

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })
    response = await callClaude({ ...body, system, messages, tools: TOOLS })
  }

  if (startedConversationId) {
    response._conversation_id = startedConversationId
  }
  if (startedConversationId) {
    response._conversation_id = startedConversationId
  }
  return response
}

async function callClaude(body: any) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: body.model || 'claude-sonnet-4-6',
      max_tokens: body.max_tokens || 1000,
      system: body.system,
      tools: body.tools,
      messages: body.messages,
    }),
  })
  return res.json()
}

async function checkAndConsumeCredit(
  company_id: string,
  feature: string
): Promise<{ ok: boolean; remaining?: number; reason?: string }> {
  const { data, error } = await supabaseAdmin.rpc('consume_ai_credit', {
    p_company_id: company_id,
    p_feature: feature,
  })
  if (error) return { ok: false, reason: 'db_error' }
  if (!data?.success) return { ok: false, reason: data?.reason || 'no_credits' }
  return { ok: true, remaining: data.remaining }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.skip_credit_check) {
      const company_id: string | undefined = body.company_id
      if (!company_id) {
        return NextResponse.json(
          { error: 'company_id required', code: 'missing_company_id' },
          { status: 400 }
        )
      }

      const feature = body.skipTools
        ? (body.credit_feature || 'ai_fill')
        : 'kb_chat'

      const credit = await checkAndConsumeCredit(company_id, feature)
      if (!credit.ok) {
        return NextResponse.json(
          { error: 'Insufficient AI credits', code: 'no_credits', reason: credit.reason },
          { status: 402 }
        )
      }

      const result = await (body.skipTools
        ? callClaude({ ...body, tools: undefined })
        : runWithTools(body))
      const response = NextResponse.json(result)
      response.headers.set('X-AI-Credits-Remaining', String(credit.remaining ?? 0))
      return response
    }

    if (body.skipTools) {
      const data = await callClaude({ ...body, tools: undefined })
      return NextResponse.json(data)
    }
    const data = await runWithTools(body)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
