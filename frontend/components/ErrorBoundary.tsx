import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.warn("ErrorBoundary atrapó un error:", error, info);
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Algo salió mal 😥</Text>
          <Text style={styles.message}>
            Ocurrió un error inesperado. Puedes intentar recargar la pantalla.
          </Text>
          <TouchableOpacity onPress={this.reset} style={styles.btn}>
            <Text style={styles.btnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  message: { textAlign: "center", opacity: 0.7, marginBottom: 16 },
  btn: { backgroundColor: "#4F46E5", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  btnText: { color: "#fff", fontWeight: "600" },
});