import { ExpoRoot } from "expo-router";

/**
 * Fix para TypeScript + Expo Router
 */
const ctx = require.context("./app");

export default function App() {
  return <ExpoRoot context={ctx} />;
}