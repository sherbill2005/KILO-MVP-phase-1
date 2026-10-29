import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/theme/colors';
import { RestTimerProvider } from './src/context/RestTimerContext';
import { WorkoutProvider } from './src/context/WorkoutContext';
import { AudioClient } from './src/services/audio/audioClient';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[RootErrorBoundary] Render crash caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>App Render Error</Text>
          <Text style={styles.errorMessage}>
            {String(this.state.error?.message || this.state.error)}
          </Text>
          <ScrollView style={styles.errorScroll}>
            <Text style={styles.errorStack}>{this.state.error?.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    try {
      // Sweep any orphaned audio recordings left behind from past sessions
      AudioClient.cleanStaleAudioCache();
    } catch (e) {
      console.warn('[App] Stale cache clean caught:', e);
    }
  }, []);

  return (
    <RootErrorBoundary>
      <RestTimerProvider>
        <WorkoutProvider>
          <View style={styles.container}>
            <StatusBar style="light" />
            <RootNavigator />
          </View>
        </WorkoutProvider>
      </RestTimerProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0B0E14',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    color: '#FF3B30',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  errorMessage: {
    color: '#D4FF00',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorScroll: {
    maxHeight: 200,
    backgroundColor: '#161B26',
    borderRadius: 8,
    padding: 12,
    width: '100%',
  },
  errorStack: {
    color: '#8892B0',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
