import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/theme/colors';

import { RestTimerProvider } from './src/context/RestTimerContext';
import { WorkoutProvider } from './src/context/WorkoutContext';

export default function App() {
  return (
    <RestTimerProvider>
      <WorkoutProvider>
        <View style={styles.container}>
          <StatusBar style="light" />
          <RootNavigator />
        </View>
      </WorkoutProvider>
    </RestTimerProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
});
