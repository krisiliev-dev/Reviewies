import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the person using this has asked the system for less movement.
 *
 * index.css already flattens every CSS transition and animation under this setting,
 * which is the right default and the wrong answer for one component: the reaction
 * stream's drift is a keyframe animation, so a blanket `animation-duration: 0.01ms`
 * ran it instantly to its end state — off the left-hand edge — and the flagship
 * feature showed nothing at all. Reduced motion has to mean a different presentation
 * here, not a faster one, and that decision needs to be made in JavaScript.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia(QUERY).matches,
  );

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia(QUERY);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    // The setting can change while the page is open, and the initial state was read
    // before this effect ran.
    onChange();
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
