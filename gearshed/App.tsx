import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Text } from 'react-native';
import { RootStackParamList, TabParamList } from './src/navigation';
import GearDetailScreen from './src/screens/GearDetailScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import PackingListDetailScreen from './src/screens/PackingListDetailScreen';
import PackingListsScreen from './src/screens/PackingListsScreen';
import ReviewDetectionsScreen from './src/screens/ReviewDetectionsScreen';
import ScanScreen from './src/screens/ScanScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof TabParamList, string> = {
  Inventory: '🎒',
  Scan: '📷',
  Packing: '🧾',
  Settings: '⚙️',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>
            {TAB_ICONS[route.name]}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Scan" component={ScanScreen} />
      <Tab.Screen name="Packing" component={PackingListsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="ReviewDetections"
          component={ReviewDetectionsScreen}
          options={{ title: 'Review detections' }}
        />
        <Stack.Screen
          name="GearDetail"
          component={GearDetailScreen}
          options={{ title: 'Gear details' }}
        />
        <Stack.Screen
          name="PackingListDetail"
          component={PackingListDetailScreen}
          options={{ title: 'Packing list' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
