import { useEffect, useState } from 'react'

const CARDS = [
  { rotate: '-6deg', delay: '0ms',   bg: '#EAE6DA', zIndex: 0 },
  { rotate: '3deg',  delay: '80ms',  bg: '#EFECE3', zIndex: 1 },
  { rotate: '-2deg', delay: '160ms', bg: '#F4F2EB', zIndex: 2 },
  { rotate: '1deg',  delay: '240ms', bg: '#FAF9F6', zIndex: 3 },
]

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function IndexCardPanel() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="relative" style={{ width: 280, height: 360 }}>
        {CARDS.map((card, i) => (
          <div
            key={i}
            className="card-animated absolute inset-0 rounded-xl"
            style={{
              backgroundColor: card.bg,
              transform: `rotate(${card.rotate})`,
              zIndex: card.zIndex,
              boxShadow: '0 2px 12px rgba(27,36,48,0.08), 0 1px 3px rgba(27,36,48,0.06)',
              animation: mounted && !reducedMotion
                ? `card-rise 400ms ease-out ${card.delay} both`
                : undefined,
              opacity: reducedMotion || mounted ? 1 : 0,
            }}
          >
            {i === CARDS.length - 1 && (
              <div className="p-6 pt-8 flex flex-col gap-3">
                <div className="h-1.5 rounded-full bg-stroke w-2/3" />
                <div className="h-1.5 rounded-full bg-stroke w-full" />
                <div className="h-1.5 rounded-full bg-stroke w-4/5" />
                <div className="h-1.5 rounded-full bg-stroke w-full" />
                <div className="h-1.5 rounded-full bg-stroke w-3/5" />
                <div className="mt-2 h-1.5 rounded-full bg-stroke w-full" />
                <div className="h-1.5 rounded-full bg-stroke w-11/12" />
                <div className="h-1.5 rounded-full bg-stroke w-4/5" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
