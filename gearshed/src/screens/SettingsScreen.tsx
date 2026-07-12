import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, FieldLabel } from '../components/ui';
import { useGearStore } from '../store/useGearStore';
import { colors, radius, spacing } from '../theme';

export default function SettingsScreen() {
  const settings = useGearStore((s) => s.settings);
  const updateSettings = useGearStore((s) => s.updateSettings);
  const resetAll = useGearStore((s) => s.resetAll);
  const itemCount = useGearStore((s) => s.items.length);

  const confirmReset = () =>
    Alert.alert(
      'Clear all data',
      `Delete all ${itemCount} gear items and every packing list? Settings are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: resetAll },
      ],
    );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md, paddingBottom: 48 }}>
      <Text style={styles.title}>Settings</Text>

      <FieldLabel>Anthropic API key</FieldLabel>
      <TextInput
        style={styles.input}
        value={settings.anthropicApiKey}
        placeholder="sk-ant-…"
        placeholderTextColor={colors.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        onChangeText={(t) => updateSettings({ anthropicApiKey: t })}
      />
      <Text style={styles.note}>
        Used for AI gear detection (Claude vision). Get a key at console.anthropic.com. For a
        public release this call should move to a backend so the key never ships in the app.
      </Text>

      <FieldLabel>Demo mode</FieldLabel>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Use sample detections instead of the AI</Text>
        <Switch
          value={settings.mockMode}
          onValueChange={(v) => updateSettings({ mockMode: v })}
          trackColor={{ true: colors.forest }}
        />
      </View>

      <FieldLabel>Amazon affiliate tag</FieldLabel>
      <TextInput
        style={styles.input}
        value={settings.amazonAffiliateTag}
        placeholder="yourtag-20"
        placeholderTextColor={colors.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(t) => updateSettings({ amazonAffiliateTag: t })}
      />
      <Text style={styles.note}>
        Your Amazon Associates tracking ID. Every "Find on Amazon" link in gear details will carry
        it, so purchases through those links earn your commission.
      </Text>

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Clear all gear & lists" kind="danger" onPress={confirmReset} />
      </View>

      <Text style={styles.footer}>GearShed · your gear, cataloged by AI</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  note: { fontSize: 12, color: colors.inkFaint, marginTop: spacing.sm, lineHeight: 17 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  switchLabel: { flex: 1, fontSize: 14, color: colors.ink, marginRight: spacing.md },
  footer: {
    textAlign: 'center',
    color: colors.inkFaint,
    fontSize: 12,
    marginTop: spacing.xl,
  },
});
