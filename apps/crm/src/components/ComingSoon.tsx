import { Clock } from 'lucide-react'

export default function ComingSoon({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}
      >
        <Clock size={22} className="text-blue-400" />
      </div>
      <h2 className="text-xl font-bold mb-2">{feature} is coming soon</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        We're still building this out. The rest of your dashboard is fully usable in the meantime.
      </p>
    </div>
  )
}
