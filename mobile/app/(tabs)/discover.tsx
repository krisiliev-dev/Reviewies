import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSuggestions, type Suggestion } from '@reviewies/core/discover/recommend';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { db } from '@reviewies/core/data/db';
import { COPY } from '@reviewies/core/copy';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import { Poster } from '../../src/ui/Poster';
import { theme } from '../../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type } from '@reviewies/core/tokens';
import { Button } from '../../src/ui/Button';
import { Row as BaseRow } from '../../src/ui/Row';

import { Note } from '../../src/ui/Note';
import { Attribution } from '../../src/ui/Attribution';
import { Masthead } from '../../src/ui/Masthead';

/**
 * Suggestions that exclude what you have already seen.
 *
 * Exclusion is the module's purpose rather than a filter on top of it — being
 * recommended something you finished last week was the single most repeated complaint
 * on Trakt's roadmap.
 */
export default function DiscoverScreen() {
  const [items, setItems] = useState<Suggestion[]>();
  const [error, setError] = useState<string>();

  /**
   * Reloaded after acting, so something you have just tracked leaves the feed.
   *
   * The whole point of this screen is that it excludes what you have seen; a suggestion
   * that stays put after you take it makes the screen look like it did not hear you.
   */
  const [round, setRound] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void getSuggestions().then(
      (result: Suggestion[]) => !cancelled && setItems(result),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load'),
    );
    return () => {
      cancelled = true;
    };
  }, [round]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Masthead>{COPY.screens.discover}</Masthead>
        {/* Two modes, said apart. The web's copy of this has the reasoning. */}
        <Note>{items?.[0]?.trending ? COPY.discover.trendingBlurb : COPY.discover.blurb}</Note>

        {items === undefined && !error && <ActivityIndicator color={theme.workingMark} />}
        {error && <Text style={styles.error}>{error}</Text>}
        {items?.length === 0 && (
          <Note>{COPY.discover.empty}</Note>
        )}

        {items?.map((item) => <Row key={item.id} item={item} onActed={() => setRound((n) => n + 1)} />)}

        <Attribution of={['tmdb']} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ item, onActed }: { item: Suggestion; onActed: () => void }) {
  const [added, setAdded] = useState<'library' | 'watchlist'>();

  /**
   * A suggestion carries everything a title row needs, and nothing has stored it.
   *
   * Acting on one has to write the title first or the library gains an id with no name
   * — the same cache step the web's Discover does.
   */
  async function cache() {
    await db.titles.put({
      id: item.id,
      kind: item.kind,
      name: item.name,
      year: item.year,
      overview: item.overview,
      posterUrl: item.posterUrl,
      fetchedAt: Date.now(),
    });
  }

  async function track() {
    await cache();
    /*
     * The feed reloads before the episodes land, for the reason `Search`'s `track` gives:
     * the show is tracked by the line above, and waiting on twenty-four season requests to
     * say so is a control that looks untouched for half a minute. §6.153.
     */
    await addToLibrary(item.id, item.kind);
    setAdded('library');
    onActed();
    if (item.kind === 'show') void getEpisodesCached(item.id).catch(() => {});
  }

  async function save() {
    await cache();
    await addToWatchlist(item.id, item.kind, `Suggested by ${item.because[0]}`);
    setAdded('watchlist');
    onActed();
  }

  return (
    <BaseRow
      title={item.name}
      meta={`${item.kind === 'show' ? COPY.kinds.show : COPY.kinds.film}${item.year ? ` · ${item.year}` : ''}`}
      // Saying why is what separates a recommendation from an advert. In `note` because
      // that is the slot for a sentence about the row rather than a fact about it.
      // A trending row is not *because* of anything you watched, and saying it was is a
      // false sentence on the one line of the card a person actually reads. §6.152.
      // The web's copy of this carries the reasoning: a trending row says nothing here,
      // because the sentence it used to say was the screen's mode rather than the row's.
      note={item.trending ? undefined : COPY.discover.because(item.because, item.becauseWatched)}
      lead={<Poster url={item.posterUrl} name={item.name} />}
      open={{
        // §6.96: the poster and the title were separate links to the same route under the
        // same name, so the card announced "Open Quiet Harbour" twice.
        name: `Open ${item.name}`,
        to: `/title/${encodeURIComponent(item.id)}`,
      }}
      under={
        /* Doc 10, second evening: a suggestion here was a link and nothing else, so the
           screen whose whole job is getting something into your library made you open the
           show to do it. The web has offered both since Discover shipped. */
        <View style={styles.under}>
          {/* `disabled` on the component drops the fill for an outline and steps the label
              to the tertiary ink. It does NOT fade: `styles.disabled` here was
              `opacity: 0.5`, which is the exact thing `appearance.test.ts` has banned on
              the web since it "gave a maroon block with dark red lettering — it read as
              broken rather than as waiting". The phone had eight of these and no guard. */}
          <Button
            onPress={track}
            disabled={added === 'library'}
            tone="primary"
            label={added === 'library' ? COPY.controls.tracking : COPY.controls.track}
            name={COPY.controls.trackTitle(item.name)}
          />
          <Button
            onPress={save}
            disabled={added === 'watchlist'}
            tone="secondary"
            label={added === 'watchlist' ? COPY.watchlist.alreadyOn : COPY.controls.watchlist}
            name={COPY.controls.addToWatchlist(item.name)}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  under: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  screen: { flex: 1, backgroundColor: theme.ground },
  content: { padding: SCREEN.edge, gap: 12 },
  error: { color: theme.trouble, fontSize: text.s14, fontFamily: type.family.body.name },
});
