import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS } from '../theme/colors';
import { Flame, CloudCheck, Settings as SettingsIcon, Wifi } from 'lucide-react-native';

interface HeaderBarProps {
  title?: string;
  subtitle?: string;
  onSettingsPress?: () => void;
  showSyncBadge?: boolean;
  streakCount?: number;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title = 'KILO',
  subtitle,
  onSettingsPress,
  showSyncBadge = true,
  streakCount = 4,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <Text style={styles.logo}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.rightSection}>
        {/* Streak Badge */}
        <View style={styles.streakBadge}>
          <Flame size={14} color={COLORS.secondaryAccent} />
          <Text style={styles.streakText}>{streakCount}d</Text>
        </View>

        {/* Sync / Offline status */}
        {showSyncBadge && (
          <View style={styles.syncBadge}>
            <CloudCheck size={14} color={COLORS.success} />
            <Text style={styles.syncText}>Offline-Ready</Text>
          </View>
        )}

        {/* Settings button */}
        {onSettingsPress && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onSettingsPress}
            activeOpacity={0.7}
          >
            <SettingsIcon size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.bgBase,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDark,
  },
  leftSection: {
    flexDirection: 'column',
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.25)',
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondaryAccent,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.25)',
  },
  syncText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.success,
  },
  iconButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
});
