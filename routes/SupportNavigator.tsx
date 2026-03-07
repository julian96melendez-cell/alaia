import { Ionicons } from "@expo/vector-icons";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { TouchableOpacity } from "react-native";
import useTheme from "../hooks/useTheme";
import AboutScreen from "../screens/AboutScreen";
import HelpScreen from "../screens/HelpScreen";

export type SupportStackParamList = {
  Help: undefined;
  About: undefined;
};

const Stack = createNativeStackNavigator<SupportStackParamList>();

export default function SupportNavigator({ navigation }: any) {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="Help"
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        headerTitleAlign: "center",
        headerShadowVisible: false,
        animation: "slide_from_right",
      }}
    >
      {/* Pantalla de ayuda */}
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{
          title: "Centro de ayuda",
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
              onPress={() => navigation.navigate("About")}
              style={{ paddingHorizontal: 10 }}
            >
              <Ionicons name="information-circle-outline" size={24} color={theme.tint} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Pantalla acerca de */}
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{
          title: "Acerca de la app",
          headerBackTitleVisible: false,
          headerBackTitle: "Atrás",
          headerBackVisible: true,
          headerRight: () => (
            <Ionicons name="star-outline" size={22} color={theme.tint} />
          ),
        }}
      />
    </Stack.Navigator>
  );
}