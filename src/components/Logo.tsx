// src/components/Logo.tsx
import Link from 'next/link'

interface LogoProps {
  size?: number
  linkTo?: string
  dark?: boolean
  showMotto?: boolean
}

export default function Logo({ size = 18, linkTo = '/', dark = false, showMotto = false }: LogoProps) {
  const content = (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <span style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: size,
        fontWeight: 400,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        display: 'inline-block',
      }}>
        <span style={{ color: dark ? '#F7F6F2' : '#0A0A0A' }}>Exchange</span>
        <span style={{ color: '#185FA5' }}>Spare</span>
      </span>
      {showMotto && (
        <span style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: size * 0.38,
          fontWeight: 400,
          fontStyle: 'italic',
          color: '#15803d',
          letterSpacing: '0.01em',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}>
          Learn &amp; Sell &amp; Buy in Confidence
        </span>
      )}
    </span>
  )

  if (!linkTo) return content
  return (
    <Link href={linkTo} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'flex-start' }}>
      {content}
    </Link>
  )
}
