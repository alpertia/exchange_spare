import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Tool definitions ──────────────────────────────────────────────────────────
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
]

// ── Tool execution ────────────────────────────────────────────────────────────
// Resolve PN alias → canonical PN
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

async function executeTool(name: string, input: any): Promise<string> {
  try {
    if (name === 'search_products') {
      const q = (input.query || '').trim()
      const limit = input.limit || 10
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
          quantity, price, currency, condition, warehouse_location,
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
        pn: l.product?.normalized_pn,
        brand: l.product?.brand,
        description: l.product?.description,
        lifecycle: l.product?.lifecycle_status,
        seller: l.company?.name,
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
      const { data: prodData } = await supabaseAdmin
        .from('products').select('*').eq('normalized_pn', pn).single()
      if (!prodData) return `Product "${pn}" not found in catalogue`

      const { data: listingData } = await supabaseAdmin
        .from('listings')
        .select(`
          quantity, price, currency, condition, warehouse_location,
          manufacture_date, notes,
          company:company_id(name)
        `)
        .eq('status', 'active')
        .eq('product_id', prodData.id)
        .limit(20)

      return JSON.stringify({
        product: prodData,
        active_listings: (listingData || []).map((l: any) => ({
          seller: l.company?.name,
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
          quantity, price, currency, notes, created_at,
          product:product_id(normalized_pn, brand, description),
          company:company_id(name)
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
        buyer: l.company?.name,
        qty_wanted: l.quantity,
        target_price: l.price ? `${l.price} ${l.currency}` : null,
        notes: l.notes,
      })), null, 2)
    }

    return 'Unknown tool'
  } catch (err: any) {
    return `Tool error: ${err.message}`
  }
}

// ── Agentic loop ──────────────────────────────────────────────────────────────
async function runWithTools(body: any): Promise<any> {
  const messages = [...(body.messages || [])]
  const system = body.system || `You are SpareShare Assistant, an expert B2B electronics parts marketplace AI.
You have live access to the SpareShare platform database of 97,000+ products and active sell/buy listings.
When asked about product availability, ALWAYS search the database first using the provided tools.
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
      toolUseBlocks.map(async (block: any) => ({
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: await executeTool(block.name, block.input),
      }))
    )

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })
    response = await callClaude({ ...body, system, messages, tools: TOOLS })
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

// ── AI Credit check ───────────────────────────────────────────────────────────
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

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Credit gate — skip only for internal/admin calls with skip_credit_check: true
    if (!body.skip_credit_check) {
      const company_id: string | undefined = body.company_id
      if (!company_id) {
        return NextResponse.json(
          { error: 'company_id required', code: 'missing_company_id' },
          { status: 400 }
        )
      }

      // feature tag: ai_fill / find_pn for skipTools calls, kb_chat for agentic
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

      // Run and attach remaining credits to response header
      const result = await (body.skipTools
        ? callClaude({ ...body, tools: undefined })
        : runWithTools(body))
      const response = NextResponse.json(result)
      response.headers.set('X-AI-Credits-Remaining', String(credit.remaining ?? 0))
      return response
    }

    // Internal / admin calls — no credit deduction
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
