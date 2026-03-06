import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json()
    if (!image) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image }
          },
          {
            type: 'text',
            text: `You are a telecom hardware part identification expert. Look at this image of a product label, box, or hardware component.

Extract the following information:
- pn: The part number (model number, SKU, or product code). Look for labels like "Part No", "PN", "Model", "P/N", "Ref", "Product Code". Remove trailing asterisks (*).
- brand: The manufacturer brand (e.g. CISCO, NOKIA, ERICSSON, HUAWEI, JUNIPER, HPE)
- description: Brief product description if visible

Respond ONLY with valid JSON, no other text:
{"pn": "...", "brand": "...", "description": "..."}

If you cannot find a part number, respond: {"pn": null, "brand": null, "description": null}`
          }
        ]
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (e: any) {
    console.error('Scan error:', e)
    return NextResponse.json({ pn: null, brand: null, description: null, error: e.message })
  }
}
