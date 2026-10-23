import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/colors';
import { Mic, Zap, ShieldCheck, WifiOff, Dumbbell } from 'lucide-react-native';
import { HapticsService } from '../services/audio/haptics';

interface WelcomeScreenProps {
  onContinue: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onContinue }) => {
  const handleGoogleSignIn = () => {
    HapticsService.lightTap();
    onContinue();
  };

  const handleGuestMode = () => {
    HapticsService.lightTap();
    onContinue();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgBase} />

      <View style={styles.content}>
        {/* Top Logo & Glow */}
        <View style={styles.heroSection}>
          <View style={styles.iconGlowWrapper}>
            <View style={styles.glowingRing}>
              <Mic size={42} color={COLORS.primaryAccent} />
            </View>
          </View>

          <Text style={styles.title}>KILO</Text>
          <Text style={styles.tagline}>Zero-Touch Voice Workout Tracker</Text>
        </View>

        {/* Feature Pills */}
        <View style={styles.featuresContainer}>
          <View style={styles.featurePill}>
            <Zap size={16} color={COLORS.primaryAccent} />
            <Text style={styles.featureText}>&lt;100ms Voice Logging</Text>
          </View>
          <View style={styles.featurePill}>
            <ShieldCheck size={16} color={COLORS.secondaryAccent} />
            <Text style={styles.featureText}>Gym Noise Immune</Text>
          </View>
          <View style={styles.featurePill}>
            <WifiOff size={16} color={COLORS.success} />
            <Text style={styles.featureText}>100% Offline Capable</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            activeOpacity={0.85}
          >
            <Dumbbell size={20} color={COLORS.bgBase} />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestButton}
            onPress={handleGuestMode}
            activeOpacity={0.7}
          >
            <Text style={styles.guestButtonText}>Explore as Guest (Offline Mode)</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footerText}>
          Built for the iron · No advertisements · Local-First
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 32,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  iconGlowWrapper: {
    marginBottom: 20,
    position: 'relative',
  },
  glowingRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primaryAccent,
    shadowColor: COLORS.primaryAccent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  featuresContainer: {
    gap: 12,
    marginVertical: 20,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceCard,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  featureText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  actionsContainer: {
    gap: 12,
  },
  googleButton: {
    backgroundColor: COLORS.textPrimary,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.bgBase,
  },
  guestButton: {
    backgroundColor: COLORS.surfaceElevated,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  guestButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textMuted,
  },
});
