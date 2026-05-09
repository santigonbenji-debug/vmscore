export default function BrandLogo({ className = 'h-9 w-9', showText = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src="/icons/icon-512.png"
        alt="VMScore"
        className={`${className} rounded-xl object-contain`}
      />
      {showText && (
        <span className="text-primary font-extrabold text-lg tracking-tight">VMScore</span>
      )}
    </span>
  )
}
