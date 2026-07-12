import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { detectGearInPhoto, mockDetectGear } from '../services/claude';
import { useGearStore } from '../store/useGearStore';
import { colors, radius, spacing } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  base64: true,
  exif: false,
};

export default function ScanScreen() {
  const navigation = useNavigation<Nav>();
  const settings = useGearStore((s) => s.settings);
  const [scanning, setScanning] = useState(false);

  const analyze = async (asset: ImagePicker.ImagePickerAsset) => {
    setScanning(true);
    try {
      const useMock = settings.mockMode || !settings.anthropicApiKey.trim();
      const result = useMock
        ? await mockDetectGear()
        : await detectGearInPhoto(asset.base64 ?? '', asset.mimeType, settings.anthropicApiKey);

      if (result.items.length === 0) {
        Alert.alert('No gear found', 'The AI could not find any gear in this photo. Try a clearer, closer shot.');
        return;
      }
      navigation.navigate('ReviewDetections', {
        photoUri: asset.uri,
        photoWidth: asset.width,
        photoHeight: asset.height,
        result,
      });
    } catch (err) {
      Alert.alert('Scan failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setScanning(false);
    }
  };

  const pick = async (fromCamera: boolean) => {
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access needed', 'Enable camera access in iOS Settings to scan gear.');
        return;
      }
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (!res.canceled && res.assets[0]) {
      await analyze(res.assets[0]);
    }
  };

  const usingMock = settings.mockMode || !settings.anthropicApiKey.trim();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan your gear</Text>
      <Text style={styles.body}>
        Take a photo of a gear pile, a packed campsite, or your garage shelves. AI finds each
        piece of gear and you confirm what goes into your inventory.
      </Text>

      <View style={styles.buttons}>
        <Button label="📷  Take a photo" onPress={() => pick(true)} loading={scanning} />
        <Button
          label="🖼  Choose from library"
          kind="secondary"
          onPress={() => pick(false)}
          disabled={scanning}
        />
      </View>

      {scanning && (
        <Text style={styles.scanningNote}>Analyzing photo… this can take a few seconds.</Text>
      )}

      <View style={styles.modeBadge}>
        <Text style={styles.modeBadgeText}>
          {usingMock
            ? 'Demo mode: sample detections. Add your Anthropic API key in Settings for real scans.'
            : 'Live AI detection enabled.'}
        </Text>
      </View>

      <View style={styles.tips}>
        <Text style={styles.tipsTitle}>Tips for better detection</Text>
        <Text style={styles.tip}>• Spread gear out so items don't overlap</Text>
        <Text style={styles.tip}>• Good lighting, shoot from above when possible</Text>
        <Text style={styles.tip}>• Keep brand logos visible for brand detection</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, marginTop: spacing.sm },
  body: { fontSize: 15, color: colors.inkSoft, lineHeight: 22, marginTop: spacing.sm },
  buttons: { gap: spacing.sm, marginTop: spacing.xl },
  scanningNote: {
    marginTop: spacing.md,
    color: colors.forest,
    fontSize: 14,
    textAlign: 'center',
  },
  modeBadge: {
    marginTop: spacing.xl,
    backgroundColor: colors.emberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  modeBadgeText: { color: colors.ember, fontSize: 13, lineHeight: 18 },
  tips: { marginTop: spacing.xl },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  tip: { fontSize: 14, color: colors.inkSoft, lineHeight: 22 },
});
