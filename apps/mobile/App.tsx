import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/theme/colors';
import { RestTimerProvider } from './src/context/RestTimerContext';
import { WorkoutProvider } from './src/context/WorkoutContext';
import { AudioClient } from './src/services/audio/audioClient';

export default function App() {
  useEffect(() => {
    // Sweep any orphaned audio recordings left behind from past sessions
    AudioClient.cleanStaleAudioCache();
  }, []);

  return (
    <SafeAreaProvider>
      <RestTimerProvider>
        <WorkoutProvider>
          <View style={styles.container}>
            <StatusBar style="light" />
            <RootNavigator />
          </View>
        </WorkoutProvider>
      </RestTimerProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
});
