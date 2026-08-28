import { Link, useLocation } from 'react-router-dom';
import { Button } from '../ui/Button';

/**
 * The screen for an address that is not a screen.
 *
 * There was no catch-all route, so `<Routes>` matched nothing and rendered nothing: the
 * page was the tab bar, the skip link and an empty `<main>`. No message, no heading,
 * nothing to say what had happened. §6.40 found it by asking which states the suites had
 * never driven, and this was the plainest of them — nothing had ever loaded a URL the app
 * does not have.
 *
 * That mattered more than a missing 404 usually does, because the smoke suite was reading
 * this blank page. It asked `/account` — an address the phone has and the web does not —
 * to find out whether the build had Supabase credentials, and an empty body does not
 * contain "not configured on this build", so the answer was "configured" every time. Three
 * checks branch on it. On a credential-free build they would have asserted the wrong half
 * and failed a correct app, which is the exact failure the comment above them was written
 * to prevent.
 *
 * The address is shown because a wrong URL is usually a typo or a stale link, and seeing
 * which one arrived is what tells the difference.
 */
export function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col gap-3 p-6">
      <h1 className="text-s24 font-title font-semibold">Nothing at this address</h1>
      <p className="text-ink-secondary">
        <code className="rounded-plate bg-ground-raised px-1.5 py-0.5 text-s14">{pathname}</code> is not
        a screen in this app. It may be an old link, or a typo.
      </p>
      <Button size="page" tone="primary" to="/" label="Go to Up Next" name="Go to Up Next" />
      <Link to="/more" className="rounded-pill bg-ground-raised px-4 py-3 text-center">
        See everything else
      </Link>
    </div>
  );
}
