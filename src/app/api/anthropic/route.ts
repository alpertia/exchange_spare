import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set in environment' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { system, messages, max_tokens = 800 } = body

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens,
        ...(system ? { system } : {}),
        messages,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic API error:', data)
      return NextResponse.json({ error: data?.error?.message || 'Anthropic API error' }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Route error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
