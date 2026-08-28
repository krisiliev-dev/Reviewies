import { ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useRemote } from '../src/devices/useRemote';
import { RemotePanel } from '../src/devices/RemotePanel';
import { theme } from '../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';

/**
 * The remote as a screen of its own, for when nothing is playing yet.
 *
 * The drawer inside Watching Mode is the one the brief asked for; this is where you go
 * to find a television in the first place, or to control one while doing something else
 * in the app.
 */
export default function RemoteScreen() {
  const remote = useRemote();

  return (
    <>
      <Stack.Screen options={{ title: 'Remote' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <RemotePanel remote={remote} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN.edge, gap: 20, backgroundColor: theme.ground, flexGrow: 1 },
});
