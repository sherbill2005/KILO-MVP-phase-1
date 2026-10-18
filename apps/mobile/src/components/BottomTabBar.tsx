import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { COLORS } from '../theme/colors';
import { AppScreen } from '../navigation/RootNavigator';
import { HapticsService } from '../services/audio/haptics';
import {
  LayoutDashboard,
  Play,
  Mic,
  BarChart2,
  Settings as SettingsIcon,
} from 'lucide-react-native';

interface BottomTabBarProps {
  currentScreen: AppScreen;
  onSelectScreen: (screen: AppScreen) => void;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  currentScreen,
  onSelectScreen,
}) => {
  const tabs: { screen: AppScreen; label: string; icon: React.ReactNode; isAccent?: boolean }[] = [
    {
      screen: 'HOME',
      label: 'Home',
      icon: (
        <LayoutDashboard
          size={20}
          color={currentScreen === 'HOME' ? COLORS.primaryAccent : COLORS.textSecondary}
        />
      ),
    },
    {
      screen: 'LIVE',
      label: 'Live',
      isAccent: true,
      icon: (
        <Play
          size={18}
          color={COLORS.bgBase}
          fill={COLORS.bgBase}
        />
      ),
    },
    {
      screen: 'BATCH',
      label: 'Batch',
      icon: (
        <Mic
          size={20}
          color={currentScreen === 'BATCH' ? COLORS.primaryAccent : COLORS.textSecondary}
        />
      ),
    },
    {
      screen: 'ANALYTICS',
      label: 'Analytics',
      icon: (
        <BarChart2
          size={20}
          color={currentScreen === 'ANALYTICS' ? COLORS.primaryAccent : COLORS.textSecondary}
        />
      ),
    },
    {
      screen: 'SETTINGS',
      label: 'Settings',
      icon: (
        <SettingsIcon
          size={20}
          color={currentScreen === 'SETTINGS' ? COLORS.primaryAccent : COLORS.textSecondary}
        />
      ),
    },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = currentScreen === tab.screen;

        if (tab.isAccent) {
          return (
            <TouchableOpacity
              key={tab.screen}
              style={styles.accentTabWrapper}
              onPress={() => {
                HapticsService.mediumImpact();
                onSelectScreen(tab.screen);
              }}
              activeOpacity={0.85}
            >
              <View style={[styles.accentCircle, isActive && styles.accentCircleActive]}>
                {tab.icon}
              </View>
              <Text style={[styles.tabLabel, styles.accentLabel]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={tab.screen}
            style={styles.tabItem}
            onPress={() => {
              HapticsService.lightTap();
              onSelectScreen(tab.screen);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              {tab.icon}
              {isActive && <View style={styles.activeIndicator} />}
            </View>
            <Text style={[styles.tabLabel, isActive && styles.activeTabLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#0E121A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primaryAccent,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  activeTabLabel: {
    color: COLORS.primaryAccent,
    fontWeight: '800',
  },
  accentTabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  accentCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.secondaryAccent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.secondaryAccent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: COLORS.bgBase,
  },
  accentCircleActive: {
    backgroundColor: COLORS.primaryAccent,
    shadowColor: COLORS.primaryAccent,
  },
  accentLabel: {
    marginTop: 4,
    color: COLORS.secondaryAccent,
    fontWeight: '800',
  },
});
