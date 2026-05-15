import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DatePickerModal from "@/components/DatePickerModal";
import { Priority, Task, TaskStatus, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { ApiError } from "@/services/api";
import { normalizeDateKey, parseDateKey, toDateKey } from "@/utils/date";

interface TaskFormModalProps {
  visible: boolean;
  onClose: () => void;
  editTask?: Task;
  defaultAssigneeId?: string;
  /** Prefills due date for new tasks (e.g., selected day in Calendar). */
  defaultDueDate?: string;
  /** Prefills title for new tasks (e.g., from voice command). */
  defaultTitle?: string;
  /** Prefills description for new tasks (e.g., from voice command). */
  defaultDescription?: string;
  /** Prefills priority for new tasks (e.g., from voice command). */
  defaultPriority?: Priority;
  /** Optional prompt/error shown when opening (e.g., missing voice fields). */
  initialError?: string | null;
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export default function TaskFormModal({ visible, onClose, editTask, defaultAssigneeId, defaultDueDate, defaultTitle, defaultDescription, defaultPriority, initialError }: TaskFormModalProps) {
  const colors = useColors();
  const { users, addTask, updateTask, currentUser } = useApp();
  const insets = useSafeAreaInsets();

  const priorityOptions: { value: Priority; label: string; color: string }[] = [
    { value: "critical", label: "Critical", color: colors.critical },
    { value: "high", label: "High", color: colors.high },
    { value: "medium", label: "Medium", color: colors.medium },
    { value: "low", label: "Low", color: colors.low },
  ];

  const isAdmin = currentUser?.role === "admin";

  const [title, setTitle] = useState(editTask?.title ?? defaultTitle ?? "");
  const [description, setDescription] = useState(editTask?.description ?? defaultDescription ?? "");
  const [assigneeId, setAssigneeId] = useState(
    editTask?.assigneeId ??
      (isAdmin
        ? (defaultAssigneeId ?? users[1]?.id ?? "")
        : (currentUser?.id ?? "")),
  );
  const [dueDate, setDueDate] = useState(
    editTask?.dueDate ?? toDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  );
  const [priority, setPriority] = useState<Priority>(editTask?.priority ?? defaultPriority ?? "medium");
  const [status, setStatus] = useState<TaskStatus>(editTask?.status ?? "open");
  const [tags, setTags] = useState(editTask?.tags?.join(", ") ?? "");
  const [notes, setNotes] = useState(editTask?.notes ?? "");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastVisibleRef = useRef<boolean>(false);
  const lastEditIdRef = useRef<string | undefined>(editTask?.id);

  const teamMembers = users;
  const selectableAssignees = isAdmin
    ? teamMembers
    : teamMembers.filter(u => u.id === currentUser?.id);

  const defaultAssigneeForNew = useMemo(() => {
    // Prefer a provided assignee, otherwise pick the first non-head user.
    return defaultAssigneeId ?? teamMembers[0]?.id ?? "";
  }, [defaultAssigneeId, teamMembers]);

  const defaultTitleForNew = useMemo(() => {
    return defaultTitle ?? "";
  }, [defaultTitle]);

  const defaultDescriptionForNew = useMemo(() => {
    return defaultDescription ?? "";
  }, [defaultDescription]);

  const defaultPriorityForNew = useMemo<Priority>(() => {
    return defaultPriority ?? "medium";
  }, [defaultPriority]);

  const defaultDueForNew = useMemo(() => {
    const fromCalendar = normalizeDateKey(defaultDueDate ?? "");
    if (fromCalendar) return fromCalendar;
    // Default: one week from today.
    return toDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  }, [defaultDueDate]);

  // Reset form state on open (or when switching edit targets) so fields don't leak between opens.
  useEffect(() => {
    const justOpened = visible && !lastVisibleRef.current;
    const editChanged = visible && editTask?.id !== lastEditIdRef.current;

    if (justOpened || editChanged) {
      setError(initialError ?? null);
      setShowDatePicker(false);

      setTitle(editTask?.title ?? defaultTitleForNew);
      setDescription(editTask?.description ?? defaultDescriptionForNew);
      setPriority(editTask?.priority ?? defaultPriorityForNew);
      setStatus(editTask?.status ?? "open");
      setTags(editTask?.tags?.join(", ") ?? "");
      setNotes(editTask?.notes ?? "");

      setAssigneeId(
        editTask?.assigneeId ??
          (isAdmin
            ? defaultAssigneeForNew
            : (currentUser?.id ?? defaultAssigneeForNew)),
      );

      setDueDate(editTask?.dueDate ?? defaultDueForNew);
    }

    lastVisibleRef.current = visible;
    lastEditIdRef.current = editTask?.id;
  }, [
    visible,
    editTask?.id,
    editTask?.assigneeId,
    editTask?.dueDate,
    editTask?.description,
    editTask?.notes,
    editTask?.priority,
    editTask?.status,
    editTask?.tags,
    editTask?.title,
    initialError,
    isAdmin,
    currentUser?.id,
    defaultAssigneeForNew,
    defaultDueForNew,
    defaultTitleForNew,
    defaultDescriptionForNew,
    defaultPriorityForNew,
  ]);

  const handleDismiss = useCallback(() => {
    setShowDatePicker(false);
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (title.trim().length > 500) {
      setError("Title must be 500 characters or less.");
      return;
    }
    if (description.trim().length > 5000) {
      setError("Description must be 5000 characters or less.");
      return;
    }
    if (notes.trim().length > 5000) {
      setError("Notes must be 5000 characters or less.");
      return;
    }

    const normalizedDue = normalizeDateKey(dueDate);
    if (!normalizedDue) {
      setError("Due date must be a valid date (YYYY-MM-DD)");
      return;
    }

    const resolvedAssigneeId = isAdmin ? assigneeId : (currentUser?.id ?? assigneeId);
    if (!resolvedAssigneeId) {
      setError("Assignee is required. Please select a team member.");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const tagsList = tags.split(",").map(t => t.trim()).filter(Boolean);
    if (tagsList.length > 20) {
      setError("You can add at most 20 tags.");
      return;
    }
    if (tagsList.some(tag => tag.length > 50)) {
      setError("Each tag must be 50 characters or less.");
      return;
    }

    try {
      if (editTask) {
        await updateTask(editTask.id, {
          title,
          description,
          assigneeId: resolvedAssigneeId,
          dueDate: normalizedDue,
          priority,
          status,
          tags: tagsList,
          notes,
        });
      } else {
        await addTask({
          title,
          description,
          assigneeId: resolvedAssigneeId,
          dueDate: normalizedDue,
          priority,
          status: "open",
          tags: tagsList,
          notes,
          createdBy: currentUser?.id ?? "",
        });
      }
      handleDismiss();
    } catch (err) {
      let message = err instanceof Error ? err.message : "Could not save task. Please try again.";
      if (err instanceof ApiError && err.details) {
        const first = Object.values(err.details).flat().find(Boolean);
        if (first) message = first;
      }
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [title, description, assigneeId, dueDate, priority, status, tags, notes, editTask, isAdmin, currentUser, addTask, updateTask, handleDismiss]);

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "92%",
      paddingBottom: insets.bottom + 16,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.foreground,
    },
    cancelBtn: {
      padding: 4,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 10,
    },
    saveBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.primaryForeground,
    },
    content: {
      padding: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.mutedForeground,
      marginBottom: 6,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      color: colors.foreground,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickerRow: {
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    pickerText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.foreground,
    },
    errorBox: {
      backgroundColor: colors.critical + "10",
      borderWidth: 1,
      borderColor: colors.critical + "35",
      borderRadius: 10,
      padding: 10,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      flex: 1,
      color: colors.critical,
      fontSize: 12,
      fontWeight: "600",
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: "top",
    },
    row: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 16,
    },
    priorityBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: "center",
      borderWidth: 2,
      borderColor: "transparent",
    },
    priorityText: {
      fontSize: 11,
      fontWeight: "700",
    },
    statusBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginRight: 8,
    },
    statusBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "15",
    },
    statusText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    statusTextActive: {
      color: colors.primary,
    },
    assigneeBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginRight: 8,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    assigneeBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "15",
    },
    avatarDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarDotText: {
      fontSize: 8,
      fontWeight: "700",
      color: "#fff",
    },
    assigneeText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    assigneeTextActive: {
      color: colors.primary,
    },
    assigneesWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 16,
    },
    sectionGap: {
      marginBottom: 16,
    },
  });

  const dueDateObj = parseDateKey(dueDate);
  const dueDisplay = dueDateObj
    ? dueDateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : dueDate;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleDismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <TouchableOpacity onPress={handleDismiss} style={styles.cancelBtn}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{editTask ? "Edit Task" : "New Task"}</Text>
              <TouchableOpacity onPress={handleSubmit} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {error ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={16} color={colors.critical} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Task title"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="What needs to be done?"
                placeholderTextColor={colors.mutedForeground}
                multiline
              />

              <Text style={styles.label}>Priority</Text>
              <View style={styles.row}>
                {priorityOptions.map(p => (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.priorityBtn,
                      { backgroundColor: p.color + "15" },
                      priority === p.value && { borderColor: p.color, backgroundColor: p.color + "25" },
                    ]}
                    onPress={() => setPriority(p.value)}
                  >
                    <Text style={[styles.priorityText, { color: p.color }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {editTask && (
                <>
                  <Text style={styles.label}>Status</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionGap}>
                    {STATUSES.map(s => (
                      <TouchableOpacity
                        key={s.value}
                        style={[styles.statusBtn, status === s.value && styles.statusBtnActive]}
                        onPress={() => setStatus(s.value)}
                      >
                        <Text style={[styles.statusText, status === s.value && styles.statusTextActive]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.label}>Assignee</Text>
              <View style={styles.assigneesWrap}>
                {selectableAssignees.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.assigneeBtn, assigneeId === u.id && styles.assigneeBtnActive]}
                    onPress={() => setAssigneeId(u.id)}
                  >
                    <View style={[styles.avatarDot, { backgroundColor: u.avatarColor }]}>
                      <Text style={styles.avatarDotText}>{u.name[0]}</Text>
                    </View>
                    <Text style={[styles.assigneeText, assigneeId === u.id && styles.assigneeTextActive]}>
                      {u.name.split(" ")[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Due Date</Text>
              <Pressable style={styles.pickerRow} onPress={() => setShowDatePicker(true)}>
                <Feather name="calendar" size={16} color={colors.mutedForeground} />
                <Text style={styles.pickerText}>{dueDisplay}</Text>
                <View style={{ flex: 1 }} />
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>

              <Text style={styles.label}>Tags (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={tags}
                onChangeText={setTags}
                placeholder="security, bug, feature"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional notes..."
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        title="Due date"
        initialDateKey={dueDate}
        allowPastDates={false}
        onSelect={(dateKey) => {
          setDueDate(dateKey);
        }}
      />
    </>
  );
}
