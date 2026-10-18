import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import { COLORS } from '../theme/colors';
import { WorkoutGroup, WorkoutSet, calculateEstimated1RM } from '../models/workout';
import { Trash2, Edit2, CheckCircle2, ChevronRight, X } from 'lucide-react-native';
import { HapticsService } from '../services/audio/haptics';

interface GroupedSetTableProps {
  groups: WorkoutGroup[];
  activeExerciseName?: string;
  onUpdateSet: (setId: string, newWeight: number, newReps: number) => void;
  onDeleteSet: (setId: string) => void;
  onSelectExercise?: (exerciseName: string) => void;
}

export const GroupedSetTable: React.FC<GroupedSetTableProps> = ({
  groups,
  activeExerciseName,
  onUpdateSet,
  onDeleteSet,
  onSelectExercise,
}) => {
  const [editingSet, setEditingSet] = useState<WorkoutSet | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');

  const openEditModal = (set: WorkoutSet) => {
    HapticsService.lightTap();
    setEditingSet(set);
    setEditWeight(set.weightValue.toString());
    setEditReps(set.reps.toString());
  };

  const handleSaveEdit = () => {
    if (!editingSet) return;
    const w = parseFloat(editWeight);
    const r = parseInt(editReps, 10);
    if (!isNaN(w) && !isNaN(r) && w > 0 && r > 0) {
      HapticsService.setLoggedSuccess();
      onUpdateSet(editingSet.id, w, r);
    }
    setEditingSet(null);
  };

  const handleDelete = (setId: string) => {
    HapticsService.deleteWarning();
    onDeleteSet(setId);
  };

  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No sets logged yet</Text>
        <Text style={styles.emptySubtitle}>
          Hold the mic below and say e.g. "Bench press 80 kg for 10 reps"
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {groups.map((group, gIdx) => {
        const isActive = activeExerciseName?.toLowerCase() === group.exerciseName.toLowerCase();
        return (
          <View
            key={group.id || gIdx}
            style={[styles.groupCard, isActive && styles.groupCardActive]}
          >
            {/* Group Header */}
            <TouchableOpacity
              style={styles.groupHeader}
              onPress={() => onSelectExercise?.(group.exerciseName)}
              activeOpacity={0.7}
            >
              <View style={styles.groupHeaderLeft}>
                <Text style={styles.exerciseTitle}>{group.exerciseName}</Text>
                {isActive && (
                  <View style={styles.activePill}>
                    <Text style={styles.activePillText}>ACTIVE CONTEXT</Text>
                  </View>
                )}
              </View>
              <Text style={styles.targetSetsText}>
                {group.sets.length} {group.targetSets ? `/ ${group.targetSets}` : ''} Sets
              </Text>
            </TouchableOpacity>

            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thCell, { flex: 0.8 }]}>SET</Text>
              <Text style={[styles.thCell, { flex: 1.4 }]}>WEIGHT</Text>
              <Text style={[styles.thCell, { flex: 1.2 }]}>REPS</Text>
              <Text style={[styles.thCell, { flex: 1.4 }]}>1RM EST</Text>
              <Text style={[styles.thCell, { flex: 1.2, textAlign: 'right' }]}>ACTIONS</Text>
            </View>

            {/* Table Rows */}
            {group.sets.map((set, sIdx) => {
              const isLast = sIdx === group.sets.length - 1;
              const est1RM = calculateEstimated1RM(set.weightValue, set.reps);

              return (
                <View
                  key={set.id || sIdx}
                  style={[
                    styles.tableRow,
                    isLast && isActive && styles.latestLoggedRow,
                  ]}
                >
                  <View style={[styles.tdCell, { flex: 0.8 }]}>
                    <View style={styles.setNumberBadge}>
                      <Text style={styles.setNumberText}>{set.setIndex || sIdx + 1}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.tdCell, { flex: 1.4 }]}
                    onPress={() => openEditModal(set)}
                  >
                    <Text style={styles.weightText}>
                      {set.weightValue} <Text style={styles.unitText}>{set.weightUnit}</Text>
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tdCell, { flex: 1.2 }]}
                    onPress={() => openEditModal(set)}
                  >
                    <Text style={styles.repsText}>{set.reps}</Text>
                  </TouchableOpacity>

                  <View style={[styles.tdCell, { flex: 1.4 }]}>
                    <Text style={styles.est1RMText}>
                      {est1RM} <Text style={styles.unitText}>{set.weightUnit}</Text>
                    </Text>
                  </View>

                  <View style={[styles.tdCell, { flex: 1.2, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }]}>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => openEditModal(set)}
                    >
                      <Edit2 size={15} color={COLORS.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleDelete(set.id)}
                    >
                      <Trash2 size={15} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      {/* Edit Set Modal */}
      <Modal
        visible={editingSet !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSet(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.editModalCard}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Edit Set</Text>
              <TouchableOpacity onPress={() => setEditingSet(null)}>
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.editInputsRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weight ({editingSet?.weightUnit || 'kg'})</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  value={editWeight}
                  onChangeText={setEditWeight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reps</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  value={editReps}
                  onChangeText={setEditReps}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
              <Text style={styles.saveBtnText}>Update Set</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  groupCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    overflow: 'hidden',
  },
  groupCardActive: {
    borderColor: 'rgba(212, 255, 0, 0.4)',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDark,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exerciseTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  activePill: {
    backgroundColor: 'rgba(212, 255, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  activePillText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.secondaryAccent,
  },
  targetSetsText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDark,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  thCell: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDark,
  },
  latestLoggedRow: {
    backgroundColor: 'rgba(0, 229, 255, 0.04)',
  },
  tdCell: {
    justifyContent: 'center',
  },
  setNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  setNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  weightText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  repsText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.secondaryAccent,
  },
  est1RMText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryAccent,
  },
  unitText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  editModalCard: {
    backgroundColor: COLORS.surfaceCard,
    width: '100%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  editInputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  saveBtn: {
    backgroundColor: COLORS.primaryAccent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.bgBase,
  },
});
