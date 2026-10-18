import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LiveWorkoutScreen } from '../screens/LiveWorkoutScreen';
import { BatchWorkoutScreen } from '../screens/BatchWorkoutScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { BottomTabBar } from '../components/BottomTabBar';
import { COLORS } from '../theme/colors';

export type AppScreen = 'WELCOME' | 'HOME' | 'LIVE' | 'BATCH' | 'ANALYTICS' | 'SETTINGS';

export const RootNavigator: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('HOME');

  const renderScreen = () => {
    switch (currentScreen) {
      case 'WELCOME':
        return <WelcomeScreen onContinue={() => setCurrentScreen('HOME')} />;
      case 'HOME':
        return (
          <HomeScreen
            onStartLiveWorkout={() => setCurrentScreen('LIVE')}
            onStartBatchWorkout={() => setCurrentScreen('BATCH')}
            onOpenAnalytics={() => setCurrentScreen('ANALYTICS')}
            onOpenSettings={() => setCurrentScreen('SETTINGS')}
          />
        );
      case 'LIVE':
        return (
          <LiveWorkoutScreen
            onFinish={() => setCurrentScreen('HOME')}
            onBack={() => setCurrentScreen('HOME')}
          />
        );
      case 'BATCH':
        return (
          <BatchWorkoutScreen
            onFinish={() => setCurrentScreen('HOME')}
            onBack={() => setCurrentScreen('HOME')}
          />
        );
      case 'ANALYTICS':
        return <AnalyticsScreen onBack={() => setCurrentScreen('HOME')} />;
      case 'SETTINGS':
        return <SettingsScreen onBack={() => setCurrentScreen('HOME')} />;
      default:
        return (
          <HomeScreen
            onStartLiveWorkout={() => setCurrentScreen('LIVE')}
            onStartBatchWorkout={() => setCurrentScreen('BATCH')}
            onOpenAnalytics={() => setCurrentScreen('ANALYTICS')}
            onOpenSettings={() => setCurrentScreen('SETTINGS')}
          />
        );
    }
  };

  // Hide bottom navigation bar during full-screen Live Workout or Welcome flow
  const showBottomBar = currentScreen !== 'WELCOME' && currentScreen !== 'LIVE';

  return (
    <View style={styles.container}>
      <View style={styles.screenContent}>{renderScreen()}</View>
      {showBottomBar && (
        <BottomTabBar
          currentScreen={currentScreen}
          onSelectScreen={(screen) => setCurrentScreen(screen)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  screenContent: {
    flex: 1,
  },
});
