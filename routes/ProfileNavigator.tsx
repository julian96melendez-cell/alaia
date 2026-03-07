import { Ionicons } from "@expo/vector-icons";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { TouchableOpacity } from "react-native";
import useTheme from "../hooks/useTheme";
import ProfileScreen from "../screens/ProfileScreen";
import SettingsScreen from "../screens/SettingsScreen";
import SupportNavigator from "./SupportNavigator";

export type ProfileStackParamList = {
  Profile: undefined;
  Settings: undefined;
  Support: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileNavigator({ navigation }: any) {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="Profile"
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        headerTitleAlign: "center",
        headerShadowVisible: false,
        animation: "fade_from_bottom",
      }}
    >
      {/* PERFIL PRINCIPAL */}
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Mi perfil",
          headerRight: () => (
            <TouchableOpacity
              style={{ paddingHorizontal: 10 }}
              onPress={() => navigation.navigate("Settings")}
            >
              <Ionicons name="settings-outline" size={22} color={theme.tint} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* CONFIGURACIÓN */}
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: "Configuración",
          headerBackTitleVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ paddingHorizontal: 10 }}
            >
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate("Support")}
              style={{ paddingHorizontal: 10 }}
            >
              <Ionicons
                name="help-circle-outline"
                size={22}
                color={theme.tint}
              />
            </TouchableOpacity>
          ),
        }}
      />

      {/* AYUDA Y SOPORTE */}
      <Stack.Screen
        name="Support"
        component={SupportNavigator}
        options={{
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}