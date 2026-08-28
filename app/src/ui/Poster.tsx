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
        className={`flex items-center justify-center bg-ground-well text-center text-s12 font-title font-semibold leading-l120 text-ink-secondary ${className}`}
        aria-hidden="true"
      >
        <span className="line-clamp-4 px-0.5">{name}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className={`bg-ground-well object-cover ${className}`}
    />
  );
}
