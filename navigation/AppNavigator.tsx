// 📁 navigation/AppNavigator.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DefaultTheme,
  NavigationContainer,
  Theme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { onAuthStateChanged, User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { auth } from "../../firebase/firebaseConfig";

/* ─────────────── Screens principales ─────────────── */
import HomeScreen from "../screens/HomeScreen";
import LoginScreen from "../screens/LoginScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import ProfileScreen from "../screens/ProfileScreen";
import RegisterScreen from "../screens/RegisterScreen";

/* ─────────────── Screens adicionales ─────────────── */
import AdminOrdersScreen from "../screens/AdminOrdersScreen";
import CartScreen from "../screens/CartScreen";
import OrdersScreen from "../screens/OrdersScreen";
import ProductDetailScreen from "../screens/ProductDetailScreen";
import ProductListScreen from "../screens/ProductListScreen";
import SettingsScreen from "../screens/SettingsScreen";
import DiscoverScreen from "../screens/TwoScreen";

/* ─────────────── Tipos globales ─────────────── */
export type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  Main: undefined;
  ProductDetail: { productId?: string } | undefined;
  ProductList: undefined;
  Cart: undefined;
  Settings: undefined;
  Orders: undefined;
  AdminOrders: undefined;
  Discover: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
};

/* ─────────────── Navigators ─────────────── */
const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

/* ─────────────── Loading ─────────────── */
function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#FFF",
      }}
    >
      <ActivityIndicator size="large" color="#6C63FF" />
      <Text style={{ marginTop: 10, fontWeight: "700" }}>Cargando…</Text>
    </View>
  );
}

/* ─────────────── Auth Navigator ─────────────── */
function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: true,
        headerTintColor: "#FFF",
        headerStyle: { backgroundColor: "#6C63FF" },
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: "Iniciar sesión" }}
      />
      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: "Crear cuenta" }}
      />
    </AuthStack.Navigator>
  );
}

/* ─────────────── Tabs inferiores ─────────────── */
function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => {
        const icons: Record<
          keyof MainTabParamList,
          keyof typeof Ionicons.glyphMap
        > = {
          Home: "home-outline",
          Profile: "person-outline",
        };

        return {
          headerShown: false,
          tabBarStyle: {
            height: Platform.OS === "ios" ? 80 : 60,
            paddingBottom: Platform.OS === "ios" ? 20 : 8,
            paddingTop: 6,
            backgroundColor: "#FFF",
            borderTopWidth: 0.5,
            borderTopColor: "#E5E7EB",
          },
          tabBarActiveTintColor: "#6C63FF",
          tabBarInactiveTintColor: "#A1A1AA",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={icons[route.name as keyof MainTabParamList]}
              size={size + 2}
              color={color}
            />
          ),
        };
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Inicio" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Perfil" }} />
    </Tab.Navigator>
  );
}

/* ─────────────── Root Navigator ─────────────── */
export default function AppNavigator() {
  const [initializing, setInitializing] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(
    null
  );
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("HAS_SEEN_ONBOARDING")
      .then((v) => setHasSeenOnboarding(!!v))
      .finally(() => setInitializing(false));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return unsubscribe;
  }, []);

  const isAuthenticated = !!user;
  const theme: Theme = useMemo(() => DefaultTheme, []);

  if (initializing || hasSeenOnboarding === null) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer theme={theme}>
      <RootStack.Navigator
        initialRouteName={
          !hasSeenOnboarding ? "Onboarding" : !isAuthenticated ? "Auth" : "Main"
        }
        screenOptions={{ headerShown: false }}
      >
        {!hasSeenOnboarding && (
          <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        )}

        {!isAuthenticated && (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}

        {isAuthenticated && (
          <RootStack.Screen name="Main" component={MainTabs} />
        )}

        <RootStack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <RootStack.Screen name="ProductList" component={ProductListScreen} />
        <RootStack.Screen name="Settings" component={SettingsScreen} />
        <RootStack.Screen name="Orders" component={OrdersScreen} />
        <RootStack.Screen name="AdminOrders" component={AdminOrdersScreen} />
        <RootStack.Screen name="Cart" component={CartScreen} />
        <RootStack.Screen name="Discover" component={DiscoverScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}