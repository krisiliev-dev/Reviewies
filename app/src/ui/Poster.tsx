interface PosterProps {
  url?: string;
  name: string;
  className?: string;
}

/**
 * Posters are loaded straight from the provider CDN rather than cached locally —
 * iOS caps the Cache API at roughly 50 MB per partition, and artwork would crowd out
 * the data that actually needs to survive.
 */
export function Poster({ url, name, className = '' }: PosterProps) {
  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-2 text-center text-[0.625rem] leading-tight text-muted ${className}`}
        aria-hidden="true"
      >
        <span className="line-clamp-3 px-1">{name}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className={`bg-surface-2 object-cover ${className}`}
    />
  );
}
